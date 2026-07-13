"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  BatteryCharging,
  CalendarClock,
  Gauge,
  Leaf,
  Loader2,
  Moon,
  Route as RouteIcon,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { loadInsights, type Suggestion } from "@/modules/insights";
import PageHeader from "@/components/layout/PageHeader";
import Card, { CardTitle } from "@/components/ui/Card";
import EmptyState from "@/components/dashboard/EmptyState";
import LoadChart from "@/components/charts/LoadChart";
import ActivityBars from "@/components/charts/ActivityBars";
import { fmtDateFull, fmtDuration, fmtInt } from "@/modules/analytics/format";

const KIND_META: Record<
  Suggestion["kind"],
  { icon: LucideIcon; chip: string }
> = {
  rest: { icon: Moon, chip: "bg-blue-soft text-blue" },
  easy: { icon: Leaf, chip: "bg-pos-soft text-pos" },
  normal: { icon: Target, chip: "bg-accent-soft text-accent" },
  build: { icon: TrendingUp, chip: "bg-orange-soft text-orange" },
  intervals: { icon: Zap, chip: "bg-orange-soft text-orange" },
  start: { icon: Sparkles, chip: "bg-accent-soft text-accent" },
};

const STATUS_LABEL = {
  low: { text: "Luft nach oben", cls: "bg-blue-soft text-blue" },
  optimal: { text: "Im grünen Bereich", cls: "bg-pos-soft text-pos" },
  high: { text: "Erhöht — Vorsicht", cls: "bg-neg-soft text-neg" },
  unknown: { text: "Zu wenig Daten", cls: "bg-soft text-ink-2" },
} as const;

export default function TrainingPage() {
  const data = useLiveQuery(loadInsights, []);

  return (
    <>
      <PageHeader title="Training" />

      {data === undefined ? (
        <div className="flex justify-center py-24 text-ink-3">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : data === null ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-12 gap-5">
          {data.staleDays >= 3 && (
            <div className="col-span-12 flex items-center gap-3 rounded-2xl bg-orange-soft px-5 py-3 text-sm text-ink-2">
              <CalendarClock className="h-4 w-4 shrink-0 text-orange" />
              Deine Daten reichen bis {fmtDateFull(data.refDay)} ({data.staleDays}{" "}
              Tage alt) — für tagesaktuelle Vorschläge einen frischen Export
              importieren.
            </div>
          )}

          {/* Vorschlag */}
          <div className="col-span-12 xl:col-span-7">
            <SuggestionCard
              suggestion={data.suggestion}
              alternative={data.alternative}
            />
          </div>

          {/* Last + Erholung */}
          <div className="col-span-12 flex flex-col gap-5 xl:col-span-5">
            <Card>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Gauge className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-ink-3">
                    Trainingslast (akut ÷ Grundlast)
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-ink">
                      {data.acwr !== null
                        ? data.acwr.toFixed(2).replace(".", ",")
                        : "–"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_LABEL[data.status].cls}`}
                    >
                      {STATUS_LABEL[data.status].text}
                    </span>
                  </div>
                </div>
              </div>
              <AcwrMeter value={data.acwr} />
              <p className="mt-2 text-xs text-ink-3">
                Akut Ø {fmtInt(data.acute)} · Grundlast Ø {fmtInt(data.chronic)}{" "}
                Punkte/Tag — ausgewogen ist 0,8 bis 1,3.
              </p>
            </Card>

            <Card>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-soft text-blue">
                  <BatteryCharging className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-ink-3">Erholung</div>
                  <div className="mt-0.5 text-2xl font-extrabold text-ink">
                    {data.recovery.score !== null ? (
                      <>
                        {data.recovery.score}
                        <span className="text-sm font-bold text-ink-3">/100</span>
                        <span className="ml-2 text-sm font-bold text-ink-2">
                          {data.recovery.label}
                        </span>
                      </>
                    ) : (
                      "–"
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                {data.recovery.rhrDelta !== null && (
                  <Chip good={data.recovery.rhrDelta <= 0.5}>
                    Ruhepuls {signed(data.recovery.rhrDelta)} bpm
                  </Chip>
                )}
                {data.recovery.hrvDeltaPct !== null && (
                  <Chip good={data.recovery.hrvDeltaPct >= -5}>
                    HRV {signed(data.recovery.hrvDeltaPct)} %
                  </Chip>
                )}
                {data.recovery.sleepRatio !== null && (
                  <Chip good={data.recovery.sleepRatio >= 0.9}>
                    Schlaf {Math.round(data.recovery.sleepRatio * 100)} % vom Schnitt
                  </Chip>
                )}
              </div>
            </Card>
          </div>

          {/* Lastverlauf */}
          <div className="col-span-12 xl:col-span-7">
            <Card>
              <CardTitle sub="Steigt die pinke Linie weit über die blaue, wird das Verletzungsrisiko größer — Punkte = Dauer × Herzfrequenz-Intensität">
                Trainingslast · 12 Wochen
              </CardTitle>
              <LoadChart data={data.loadSeries} />
            </Card>
          </div>

          {/* Wochenvolumen */}
          <div className="col-span-12 xl:col-span-5">
            <Card className="h-full">
              <CardTitle sub="Trainingszeit pro Woche · aktuelle Woche hervorgehoben">
                Wochenvolumen
              </CardTitle>
              <ActivityBars
                data={data.weeklyMinutes}
                highlightDay={data.currentWeekStart}
                tipLabel="Minuten"
                formatter={(v) => fmtDuration(v)}
              />
            </Card>
          </div>

          <p className="col-span-12 px-2 text-xs leading-relaxed text-ink-3">
            Transparenz: Die Vorschläge sind Regeln, keine Magie — Trainingslast
            nach dem TRIMP-Prinzip (Dauer × Herzfrequenz-Reserve), akute Last (7
            Tage) im Verhältnis zur Grundlast (28 Tage), Erholung aus Ruhepuls-,
            HRV- und Schlaf-Abweichung von deinen persönlichen Schnittwerten.
            Zielwerte kommen aus deinen letzten Einheiten. Keine medizinische
            Beratung — höre im Zweifel auf deinen Körper.
          </p>
        </div>
      )}
    </>
  );
}

function SuggestionCard({
  suggestion,
  alternative,
}: {
  suggestion: Suggestion;
  alternative: Suggestion | null;
}) {
  const meta = KIND_META[suggestion.kind];
  const Icon = meta.icon;

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-start gap-4">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${meta.chip}`}
        >
          <Icon className="h-7 w-7" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold text-ink">{suggestion.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            {suggestion.detail}
          </p>
          {suggestion.route && (
            <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-accent">
              <RouteIcon className="h-4 w-4 shrink-0" />
              {suggestion.route}
            </p>
          )}
        </div>
      </div>

      {suggestion.reasons.length > 0 && (
        <div className="mt-5 rounded-2xl bg-soft p-4">
          <div className="mb-2 text-xs font-bold text-ink">
            Warum dieser Vorschlag?
          </div>
          <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-ink-2">
            {suggestion.reasons.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {alternative && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-hairline px-4 py-3">
          <span className="mt-0.5 rounded-full bg-soft px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-ink-3 uppercase">
            Plan B
          </span>
          <p className="text-xs leading-relaxed text-ink-2">
            <b className="text-ink">{alternative.title.replace("Alternative: ", "")}</b>{" "}
            — {alternative.detail}
          </p>
        </div>
      )}
    </Card>
  );
}

/** Skala 0–2 mit grünem Zielband 0,8–1,3 und Marker auf dem aktuellen Wert. */
function AcwrMeter({ value }: { value: number | null }) {
  const pos = value === null ? null : Math.min(100, Math.max(0, (value / 2) * 100));
  return (
    <div className="mt-4">
      <div className="relative h-2 rounded-full bg-soft">
        <div
          className="absolute inset-y-0 rounded-full bg-pos-soft"
          style={{ left: "40%", width: "25%" }}
        />
        {pos !== null && (
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow"
            style={{ left: `${pos}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-3">
        <span>0</span>
        <span className="ml-[6%]">0,8</span>
        <span>1,3</span>
        <span>2+</span>
      </div>
    </div>
  );
}

function Chip({ good, children }: { good: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 ${
        good ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"
      }`}
    >
      {children}
    </span>
  );
}

function signed(v: number): string {
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? "+" : ""}${String(r).replace(".", ",")}`;
}
