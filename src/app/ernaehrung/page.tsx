"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Cookie,
  Flame,
  Loader2,
  Moon,
  Settings,
  Soup,
  Trash2,
  TriangleAlert,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/modules/storage/db";
import {
  MEAL_SLOT_LABEL,
  MEAL_SLOTS,
  type Meal,
  type MealSlot,
} from "@/modules/nutrition/types";
import { compressPhoto } from "@/modules/nutrition/photo";
import { estimateCaloriesFromPhoto } from "@/modules/nutrition/estimate";
import { hasApiKey } from "@/modules/nutrition/settings";
import { addDays, todayKey } from "@/modules/analytics/dates";
import { fmtDateShort, fmtInt } from "@/modules/analytics/format";
import PageHeader from "@/components/layout/PageHeader";
import Card from "@/components/ui/Card";

const SLOT_META: Record<MealSlot, { icon: LucideIcon; chip: string }> = {
  breakfast: { icon: Coffee, chip: "bg-orange-soft text-orange" },
  lunch: { icon: Soup, chip: "bg-accent-soft text-accent" },
  dinner: { icon: Moon, chip: "bg-blue-soft text-blue" },
  other: { icon: Cookie, chip: "bg-soft text-ink-2" },
};

export default function ErnaehrungPage() {
  const [day, setDay] = useState(todayKey());
  const [keyPresent, setKeyPresent] = useState(false);
  useEffect(() => setKeyPresent(hasApiKey()), []);

  const meals = useLiveQuery(
    () => db.meals.where("day").equals(day).toArray(),
    [day]
  );
  const activeEnergy = useLiveQuery(
    () => db.dailyMetrics.get(["activeEnergy", day]),
    [day]
  );

  const bySlot = useMemo(() => {
    const map = new Map<MealSlot, Meal>();
    for (const m of meals ?? []) map.set(m.slot, m);
    return map;
  }, [meals]);

  const totalKcal = (meals ?? []).reduce((a, m) => a + (m.kcal ?? 0), 0);
  const isToday = day === todayKey();

  return (
    <>
      <PageHeader title="Ernährung" />

      {/* Tagesnavigation + Bilanz */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-full bg-card p-1 shadow-sm">
          <button
            onClick={() => setDay(addDays(day, -1))}
            className="rounded-full p-2 text-ink-2 hover:bg-soft"
            title="Vorheriger Tag"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-32 px-2 text-center text-sm font-bold text-ink">
            {isToday ? "Heute" : fmtDateShort(day)}
          </span>
          <button
            onClick={() => setDay(addDays(day, 1))}
            disabled={isToday}
            className="rounded-full p-2 text-ink-2 hover:bg-soft disabled:opacity-30"
            title="Nächster Tag"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm shadow-sm">
          <Flame className="h-4 w-4 text-accent" />
          <b className="text-ink">{fmtInt(totalKcal)} kcal</b>
          <span className="text-ink-3">gegessen</span>
          {activeEnergy && (
            <>
              <span className="text-hairline">·</span>
              <b className="text-ink">{fmtInt(activeEnergy.value)} kcal</b>
              <span className="text-ink-3">aktiv verbrannt</span>
            </>
          )}
        </span>

        {!keyPresent && (
          <Link
            href="/einstellungen"
            className="ml-auto inline-flex items-center gap-2 rounded-full bg-soft px-4 py-2 text-xs font-bold text-ink-2 transition-colors hover:bg-hairline"
          >
            <Settings className="h-3.5 w-3.5" />
            KI-Schätzung einrichten
          </Link>
        )}
      </div>

      <div className="grid grid-cols-12 gap-5">
        {MEAL_SLOTS.map((slot) => (
          <div key={slot} className="col-span-12 sm:col-span-6 xl:col-span-3">
            <MealTile
              day={day}
              slot={slot}
              meal={bySlot.get(slot)}
              keyPresent={keyPresent}
            />
          </div>
        ))}
      </div>

      <p className="mt-5 px-2 text-xs leading-relaxed text-ink-3">
        Fotos und Kalorien werden nur lokal in deinem Browser gespeichert. Die
        KI-Schätzung ist optional: Erst beim Klick auf „KI schätzen lassen"
        wird das Foto an die Anthropic-API gesendet (mit deinem eigenen Key aus
        den Einstellungen). Schätzungen sind Näherungswerte — keine
        Ernährungsberatung.
      </p>
    </>
  );
}

function MealTile({
  day,
  slot,
  meal,
  keyPresent,
}: {
  day: string;
  slot: MealSlot;
  meal: Meal | undefined;
  keyPresent: boolean;
}) {
  const { icon: Icon, chip } = SLOT_META[slot];
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState<"photo" | "ki" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kcalDraft, setKcalDraft] = useState<string>("");

  useEffect(() => {
    setKcalDraft(meal?.kcal !== undefined ? String(meal.kcal) : "");
    setError(null);
  }, [meal?.kcal, day, slot]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  const photoUrl = useMemo(
    () => (meal?.photo ? URL.createObjectURL(meal.photo) : null),
    [meal?.photo]
  );
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  const upsert = async (patch: Partial<Meal>) => {
    await db.meals.put({
      day,
      slot,
      ...meal,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };

  const onPhoto = async (file: File) => {
    setBusy("photo");
    setError(null);
    try {
      const compressed = await compressPhoto(file);
      await upsert({ photo: compressed });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Foto konnte nicht gespeichert werden.");
    } finally {
      setBusy(null);
    }
  };

  const onEstimate = async () => {
    if (!meal?.photo) return;
    setBusy("ki");
    setError(null);
    try {
      const est = await estimateCaloriesFromPhoto(meal.photo);
      await upsert({
        kcal: est.kcal,
        label: est.dish,
        note: `KI-Schätzung (${est.confidence}): ${fmtInt(est.kcal_min)}–${fmtInt(est.kcal_max)} kcal. ${est.note}`,
        source: "ki",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Schätzung fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  };

  const saveKcalValue = async (raw: string) => {
    const v = parseInt(raw, 10);
    if (isFinite(v) && v >= 0 && v !== meal?.kcal) {
      await upsert({ kcal: v, source: meal?.source === "ki" ? "ki" : "manuell" });
    }
  };

  /** Speichert beim Tippen (entprellt) UND bei Fokusverlust/Enter. */
  const onKcalChange = (value: string) => {
    setKcalDraft(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveKcalValue(value), 500);
  };

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${chip}`}>
          <Icon className="h-4.5 w-4.5" strokeWidth={2.2} />
        </span>
        <h2 className="flex-1 text-sm font-bold text-ink">{MEAL_SLOT_LABEL[slot]}</h2>
        {meal && (
          <button
            onClick={() => db.meals.delete([day, slot])}
            title="Eintrag löschen"
            className="rounded-full p-1.5 text-ink-3 transition-colors hover:bg-neg-soft hover:text-neg"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Foto-Bereich */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onPhoto(f);
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy !== null}
        className={`relative mb-3 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl transition-colors ${
          photoUrl ? "" : "border-2 border-dashed border-hairline bg-soft/50 hover:bg-soft"
        }`}
        title={photoUrl ? "Foto ersetzen" : "Foto aufnehmen oder auswählen"}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={meal?.label ?? "Essensfoto"} className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-ink-3">
            {busy === "photo" ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Camera className="h-6 w-6" />
            )}
            <span className="text-xs font-semibold">Foto hinzufügen</span>
          </span>
        )}
      </button>

      {/* Kalorien */}
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={kcalDraft}
          onChange={(e) => onKcalChange(e.target.value)}
          onBlur={() => void saveKcalValue(kcalDraft)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder="—"
          className="w-24 rounded-xl border border-hairline bg-soft/50 px-3 py-2 text-right text-lg font-extrabold text-ink outline-none focus:border-accent"
        />
        <span className="text-sm font-bold text-ink-3">kcal</span>
        {meal?.source === "ki" && (
          <span className="rounded-full bg-blue-soft px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-blue uppercase">
            KI
          </span>
        )}
      </div>

      {meal?.label && (
        <p className="mt-2 text-sm font-bold text-ink">{meal.label}</p>
      )}
      {meal?.note && (
        <p className="mt-1 text-xs leading-relaxed text-ink-3">{meal.note}</p>
      )}

      {/* KI-Aktion */}
      {meal?.photo && (
        <div className="mt-auto pt-3">
          {keyPresent ? (
            <button
              onClick={onEstimate}
              disabled={busy !== null}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-sidebar px-4 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50"
            >
              {busy === "ki" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {busy === "ki" ? "Analysiere Foto …" : "KI schätzen lassen"}
            </button>
          ) : (
            <Link
              href="/einstellungen"
              className="block text-center text-xs font-semibold text-accent hover:underline"
            >
              Für die KI-Schätzung API-Key hinterlegen →
            </Link>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-neg-soft p-2.5 text-xs text-neg">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </Card>
  );
}
