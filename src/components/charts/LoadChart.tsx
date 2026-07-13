"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LoadPoint } from "@/modules/insights";
import { chartColors } from "./theme";
import ChartTip from "./ChartTip";
import { fmtDayMonth } from "@/modules/analytics/format";

const ACUTE_NAME = "Akute Last (7 Tage)";
const CHRONIC_NAME = "Grundlast (28 Tage)";

/** Akute vs. chronische Trainingslast — zwei Serien, daher mit Legende. */
export default function LoadChart({ data }: { data: LoadPoint[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-5 text-xs text-ink-2">
        <span className="flex items-center gap-2">
          <span className="h-[3px] w-4 rounded-full" style={{ background: chartColors.accent }} />
          {ACUTE_NAME}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-[3px] w-4 rounded-full" style={{ background: chartColors.blue }} />
          {CHRONIC_NAME}
        </span>
      </div>

      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={chartColors.grid} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tick={{ fill: chartColors.axis, fontSize: 11 }}
              tickFormatter={(d: string) => fmtDayMonth(d)}
              interval={Math.max(0, Math.ceil(data.length / 6) - 1)}
              dy={6}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: chartColors.axis, fontSize: 11 }}
              tickFormatter={(v: number) => `${Math.round(v)}`}
              width={40}
              tickCount={4}
            />
            <Tooltip
              cursor={{ stroke: "#c9c4b8", strokeWidth: 1 }}
              content={<ChartTip formatter={(v) => `${Math.round(v)} Punkte`} />}
            />
            <Line
              type="monotone"
              dataKey="chronic"
              name={CHRONIC_NAME}
              stroke={chartColors.blue}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="acute"
              name={ACUTE_NAME}
              stroke={chartColors.accent}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
