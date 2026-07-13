"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Loader2 } from "lucide-react";
import { db } from "@/modules/storage/db";
import type { WorkoutType } from "@/modules/health-model/types";
import {
  buildWorkoutViews,
  WORKOUT_LABEL,
  type WorkoutView,
} from "@/modules/analytics/workouts";
import PageHeader from "@/components/layout/PageHeader";
import Card from "@/components/ui/Card";
import WorkoutRow from "@/components/dashboard/WorkoutRow";
import EmptyState from "@/components/dashboard/EmptyState";
import {
  fmtDuration,
  fmtInt,
  fmtKm,
  fmtMonthYear,
} from "@/modules/analytics/format";

export default function WorkoutsPage() {
  const [filter, setFilter] = useState<WorkoutType | "all">("all");

  const views = useLiveQuery(async () => {
    const all = await db.workouts.orderBy("startDate").toArray();
    return buildWorkoutViews(all).reverse(); // neueste zuerst, Trends aus Historie
  }, []);

  const { filtered, types, months } = useMemo(() => {
    if (!views) return { filtered: [], types: [], months: [] };

    const typeCounts = new Map<WorkoutType, number>();
    for (const w of views)
      typeCounts.set(w.type, (typeCounts.get(w.type) ?? 0) + 1);
    const types = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);

    const filtered = views.filter((w) => filter === "all" || w.type === filter);

    const months: Array<{ key: string; items: WorkoutView[] }> = [];
    for (const w of filtered) {
      const key = w.day.slice(0, 7);
      const last = months[months.length - 1];
      if (last && last.key === key) last.items.push(w);
      else months.push({ key, items: [w] });
    }
    return { filtered, types, months };
  }, [views, filter]);

  const totalKm = filtered.reduce((a, w) => a + (w.distanceKm ?? 0), 0);
  const totalMin = filtered.reduce((a, w) => a + w.durationMin, 0);

  return (
    <>
      <PageHeader title="Workouts" />

      {views === undefined ? (
        <div className="flex justify-center py-24 text-ink-3">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : views.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Filterzeile — gilt für alles darunter */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <FilterChip
              active={filter === "all"}
              onClick={() => setFilter("all")}
              label={`Alle (${views.length})`}
            />
            {types.map(([type, count]) => (
              <FilterChip
                key={type}
                active={filter === type}
                onClick={() => setFilter(type)}
                label={`${WORKOUT_LABEL[type]} (${count})`}
              />
            ))}

            <div className="ml-auto text-xs font-semibold text-ink-2">
              {fmtInt(filtered.length)} Einheiten · {fmtKm(totalKm)} ·{" "}
              {fmtDuration(totalMin)}
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {months.map(({ key, items }) => (
              <Card key={key}>
                <h2 className="mb-2 px-3 text-sm font-extrabold text-ink">
                  {fmtMonthYear(`${key}-01`)}
                </h2>
                <ul className="-mx-3 flex flex-col px-3">
                  {items.map((w, i) => (
                    <WorkoutRow key={w.id ?? `${w.startDate}-${i}`} workout={w} />
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
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
