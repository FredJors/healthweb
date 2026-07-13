"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Loader2, MapPinned, Route as RouteIcon, Upload, X } from "lucide-react";
import { db } from "@/modules/storage/db";
import type { WorkoutType } from "@/modules/health-model/types";
import {
  buildRouteGroups,
  type RouteGroup,
} from "@/modules/analytics/routes";
import { WORKOUT_LABEL } from "@/modules/analytics/workouts";
import {
  fmtDateShort,
  fmtInt,
  fmtKm,
  fmtKmh,
  fmtPace,
} from "@/modules/analytics/format";
import PageHeader from "@/components/layout/PageHeader";
import Card, { CardTitle } from "@/components/ui/Card";
import Scatter3D from "@/components/charts/Scatter3D";

const RouteMap = dynamic(() => import("@/components/map/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-ink-3">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  ),
});

const DOT_COLOR: Partial<Record<WorkoutType, string>> = {
  running: "#e0446e",
  cycling: "#eb6834",
  walking: "#2a78d6",
  hiking: "#2a78d6",
  swimming: "#2a78d6",
  rowing: "#2a78d6",
};

const PACE_SPORTS: ReadonlySet<WorkoutType> = new Set([
  "running",
  "walking",
  "hiking",
]);

export default function KartePage() {
  const [typeFilter, setTypeFilter] = useState<"all" | WorkoutType>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const data = useLiveQuery(async () => {
    const [routes, workouts] = await Promise.all([
      db.routes.toArray(),
      db.workouts.toArray(),
    ]);
    return { routes, workouts };
  }, []);

  const groups = useMemo(
    () => (data ? buildRouteGroups(data.routes, data.workouts) : undefined),
    [data]
  );

  const visible = useMemo(
    () =>
      (groups ?? []).filter(
        (g) => typeFilter === "all" || g.type === typeFilter
      ),
    [groups, typeFilter]
  );

  const selected = visible.find((g) => g.id === selectedId) ?? null;
  const typesPresent = useMemo(() => {
    const counts = new Map<WorkoutType, number>();
    for (const g of groups ?? []) counts.set(g.type, (counts.get(g.type) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [groups]);

  return (
    <>
      <PageHeader title="Karte" />

      {groups === undefined ? (
        <div className="flex justify-center py-24 text-ink-3">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <NoRoutes />
      ) : (
        <>
          {/* Filterzeile — gilt für Karte, Liste und Vergleich */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <FilterChip
              active={typeFilter === "all"}
              onClick={() => {
                setTypeFilter("all");
                setSelectedId(null);
              }}
              label={`Alle (${groups.length} Strecken)`}
            />
            {typesPresent.map(([type, count]) => (
              <FilterChip
                key={type}
                active={typeFilter === type}
                onClick={() => {
                  setTypeFilter(type);
                  setSelectedId(null);
                }}
                label={`${WORKOUT_LABEL[type]} (${count})`}
              />
            ))}
            <p className="ml-auto text-xs text-ink-3">
              Kartendaten © OpenStreetMap · Deine Routen bleiben lokal
            </p>
          </div>

          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-12 xl:col-span-8">
              <Card className="h-[540px] overflow-hidden p-0">
                <RouteMap
                  groups={visible}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </Card>
            </div>

            {/* Strecken nach Häufigkeit */}
            <div className="col-span-12 xl:col-span-4">
              <Card className="flex h-[540px] flex-col">
                <CardTitle sub="Gleiche Strecken werden automatisch erkannt — auch bei unterschiedlichem Start">
                  Deine Strecken
                </CardTitle>
                <ul className="-mx-2 flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
                  {visible.map((g, rank) => (
                    <li key={g.id}>
                      <button
                        onClick={() =>
                          setSelectedId(selectedId === g.id ? null : g.id)
                        }
                        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                          selectedId === g.id
                            ? "bg-accent-soft ring-1 ring-accent/30"
                            : "hover:bg-soft"
                        }`}
                      >
                        <span className="w-6 text-center text-xs font-extrabold text-ink-3">
                          {rank + 1}
                        </span>
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: DOT_COLOR[g.type] ?? "#6e6a61" }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-ink">
                            {g.label} · ≈ {fmtKm(g.medianKm)}
                          </span>
                          <span className="block text-xs text-ink-3">
                            {g.count}× ·{" "}
                            {g.avgSpeed !== null
                              ? PACE_SPORTS.has(g.type)
                                ? `Ø ${fmtPace(60 / g.avgSpeed)}`
                                : `Ø ${fmtKmh(g.avgSpeed)}`
                              : "ohne Tempo"}
                          </span>
                        </span>
                        <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-bold text-ink-2">
                          {g.count}×
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            {/* 3D-Vergleich der ausgewählten Strecke */}
            {selected && (
              <div className="col-span-12">
                <GroupDetail
                  group={selected}
                  onClose={() => setSelectedId(null)}
                />
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function GroupDetail({
  group,
  onClose,
}: {
  group: RouteGroup;
  onClose: () => void;
}) {
  const plottable = group.points3d.filter(
    (p) => p.hr !== null && p.speed !== null
  );
  const best = plottable.reduce<(typeof plottable)[number] | null>(
    (acc, p) => (acc === null || p.speed! > acc.speed! ? p : acc),
    null
  );

  return (
    <Card>
      <div className="mb-4 flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <RouteIcon className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold text-ink">
            Strecken-Vergleich: {group.label} · ≈ {fmtKm(group.medianKm)}
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">
            {fmtInt(group.count)} Einheiten auf dieser Strecke
            {group.avgSpeed !== null && ` · Ø ${fmtKmh(group.avgSpeed)}`}
            {best &&
              ` · Bestzeit ${fmtKmh(best.speed!)}${
                best.pace ? ` (${best.pace})` : ""
              } am ${fmtDateShort(best.day)}`}
          </p>
        </div>
        <button
          onClick={onClose}
          title="Auswahl aufheben"
          className="rounded-full p-2 text-ink-3 transition-colors hover:bg-soft hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {plottable.length >= 2 ? (
        <>
          <Scatter3D points={group.points3d} />
          <p className="mt-2 text-center text-xs text-ink-3">
            Ziehen zum Drehen — sinkende Herzfrequenz bei gleichem Tempo
            bedeutet: Du wirst fitter.
          </p>
          {plottable.length < group.points3d.length && (
            <p className="mt-1 text-center text-xs text-ink-3">
              {group.points3d.length - plottable.length} Einheit(en) ohne
              Herzfrequenz-/Tempodaten sind ausgeblendet.
            </p>
          )}
        </>
      ) : (
        <p className="py-10 text-center text-sm text-ink-3">
          Für den 3D-Vergleich braucht es mindestens zwei Einheiten mit
          Herzfrequenz- und Tempodaten auf dieser Strecke.
        </p>
      )}
    </Card>
  );
}

function NoRoutes() {
  return (
    <section className="mx-auto mt-10 max-w-xl rounded-3xl bg-card p-10 text-center shadow-sm">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[linear-gradient(135deg,#f43f7f,#f95f39)] shadow-lg shadow-accent/30">
        <MapPinned className="h-8 w-8 text-white" />
      </div>
      <h2 className="mt-6 text-2xl font-extrabold text-ink">
        Noch keine GPS-Routen
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-2">
        Seit diesem Update liest der Import auch die GPS-Routen
        (workout-routes) aus der Export-ZIP. Importiere deinen Health-Export
        einmal neu, dann erscheinen deine Strecken hier auf der Karte — oder
        probiere die Demo-Daten mit Beispielrouten.
      </p>
      <div className="mt-8 flex justify-center">
        <Link
          href="/import"
          className="inline-flex items-center gap-2 rounded-full bg-sidebar px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-85"
        >
          <Upload className="h-4 w-4" />
          Zum Import
        </Link>
      </div>
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${
        active
          ? "bg-sidebar text-white"
          : "bg-card text-ink-2 shadow-sm hover:bg-soft"
      }`}
    >
      {label}
    </button>
  );
}
