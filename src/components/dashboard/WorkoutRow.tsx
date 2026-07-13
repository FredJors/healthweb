"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Bike,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Mountain,
  PersonStanding,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { WorkoutType } from "@/modules/health-model/types";
import type { WorkoutView } from "@/modules/analytics/workouts";
import {
  fmtDateShort,
  fmtDuration,
  fmtKm,
  fmtTime,
} from "@/modules/analytics/format";

const TYPE_ICON: Record<WorkoutType, { icon: LucideIcon; className: string }> = {
  running: { icon: Footprints, className: "bg-accent-soft text-accent" },
  cycling: { icon: Bike, className: "bg-orange-soft text-orange" },
  walking: { icon: PersonStanding, className: "bg-blue-soft text-blue" },
  hiking: { icon: Mountain, className: "bg-blue-soft text-blue" },
  swimming: { icon: Waves, className: "bg-blue-soft text-blue" },
  strength: { icon: Dumbbell, className: "bg-soft text-ink-2" },
  hiit: { icon: Flame, className: "bg-orange-soft text-orange" },
  yoga: { icon: PersonStanding, className: "bg-soft text-ink-2" },
  rowing: { icon: Waves, className: "bg-blue-soft text-blue" },
  other: { icon: Zap, className: "bg-soft text-ink-2" },
};

/** Eine Workout-Zeile im Stil der Vorlage: Icon-Chip, Titel, Kennzahlen,
 * Trend-Badge (Tempo ggü. Schnitt der letzten gleichartigen Einheiten). */
export default function WorkoutRow({ workout: w }: { workout: WorkoutView }) {
  const { icon: Icon, className } = TYPE_ICON[w.type];

  return (
    <li className="flex items-center gap-4 rounded-2xl px-3 py-3 transition-colors hover:bg-soft">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${className}`}
      >
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-ink">
          {w.label}
          {w.distanceKm ? (
            <span className="font-semibold text-ink-2"> · {fmtKm(w.distanceKm)}</span>
          ) : null}
        </div>
        <div className="mt-0.5 text-xs text-ink-3">
          {fmtDateShort(w.day)} · {fmtTime(w.startDate)} Uhr ·{" "}
          {fmtDuration(w.durationMin)}
        </div>
      </div>

      {w.avgHeartRate && (
        <div
          className="hidden items-center gap-1 text-xs font-bold text-ink-2 sm:flex"
          title="Durchschnittliche Herzfrequenz"
        >
          <HeartPulse className="h-3.5 w-3.5 text-accent" />
          {w.avgHeartRate}
        </div>
      )}

      {w.tempo && (
        <div className="w-24 text-right text-sm font-bold text-ink">{w.tempo}</div>
      )}

      <div className="w-24 text-right">
        {w.trend ? (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] font-bold ${
              w.trend.better ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"
            }`}
            title="Tempo im Vergleich zu deinen letzten Einheiten dieses Typs"
          >
            {w.trend.better ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {w.trend.pct} %
          </span>
        ) : (
          <span className="text-xs text-ink-3">–</span>
        )}
      </div>
    </li>
  );
}
