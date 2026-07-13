"use client";

import { Flame } from "lucide-react";
import type { DashboardData } from "@/modules/analytics/dashboard";
import Sparkline from "@/components/charts/Sparkline";
import { fmtDuration, fmtInt, fmtKm } from "@/modules/analytics/format";

/** Die Gradient-Karte oben links — die eine Kennzahl, mit der das
 * Dashboard führt (aktive Energie der letzten 7 Tage). */
export default function HeroCard({ data }: { data: DashboardData }) {
  const { week } = data;

  return (
    <section className="flex h-full flex-col rounded-3xl bg-[linear-gradient(135deg,#f43f7f_0%,#f95f39_100%)] p-6 text-white shadow-[0_16px_40px_-16px_rgba(244,63,127,0.55)]">
      <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
        <Flame className="h-4 w-4" />
        Aktive Energie · letzte 7 Tage
        {week.energyDeltaPct !== null && (
          <span className="ml-auto rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold">
            {week.energyDeltaPct >= 0 ? "+" : ""}
            {week.energyDeltaPct} % ggü. Vorwoche
          </span>
        )}
      </div>

      <div className="mt-3 text-[44px] leading-none font-extrabold tracking-tight">
        {fmtInt(week.energyKcal)}
        <span className="ml-2 text-lg font-bold text-white/75">kcal</span>
      </div>

      <div className="mt-4">
        <Sparkline data={week.energySeries} color="rgba(255,255,255,0.9)" height={44} />
      </div>

      <div className="mt-auto grid grid-cols-3 divide-x divide-white/20 pt-5">
        {[
          { label: "Workouts", value: fmtInt(week.workouts) },
          { label: "Distanz", value: fmtKm(week.distanceKm) },
          { label: "Trainingszeit", value: fmtDuration(week.durationMin) },
        ].map((s) => (
          <div key={s.label} className="px-4 first:pl-0 last:pr-0">
            <div className="text-[11px] font-semibold tracking-wide text-white/70 uppercase">
              {s.label}
            </div>
            <div className="mt-1 text-lg font-extrabold">{s.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
