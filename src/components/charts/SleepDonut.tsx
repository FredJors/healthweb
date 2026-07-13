"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { SleepNight } from "@/modules/health-model/types";
import { chartColors } from "./theme";
import ChartTip from "./ChartTip";
import { fmtDuration, fmtHoursColon } from "@/modules/analytics/format";

const STAGES = [
  { key: "deepMin", name: "Tiefschlaf", color: chartColors.sleep.deep },
  { key: "coreMin", name: "Kernschlaf", color: chartColors.sleep.core },
  { key: "remMin", name: "REM", color: chartColors.sleep.rem },
  { key: "awakeMin", name: "Wach", color: chartColors.sleep.awake },
] as const;

/** Schlafphasen der letzten Nacht als Donut mit Legende —
 * Ein-Farb-Rampe (Blau) für die Schlaftiefe, Orange für Wachphasen. */
export default function SleepDonut({ night }: { night: SleepNight }) {
  const data = STAGES.map((s) => ({
    name: s.name,
    value: night[s.key],
    color: s.color,
  })).filter((d) => d.value > 0);

  const total = night.asleepMin;

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-[170px] w-[170px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={57}
              outerRadius={80}
              paddingAngle={1.5}
              startAngle={90}
              endAngle={-270}
              stroke="#ffffff"
              strokeWidth={2}
              cornerRadius={3}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTip formatter={(v) => fmtDuration(v)} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold text-ink">
            {fmtHoursColon(total)}
          </span>
          <span className="text-[11px] text-ink-3">Stunden</span>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 text-xs">
        {STAGES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: s.color }}
            />
            <span className="w-20 text-ink-2">{s.name}</span>
            <span className="font-bold text-ink">
              {fmtDuration(night[s.key])}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
