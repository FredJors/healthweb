"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "@/modules/analytics/dashboard";
import { chartColors } from "./theme";
import ChartTip from "./ChartTip";
import { fmtDayMonth } from "@/modules/analytics/format";

/** Zeitverlauf einer Metrik (z. B. Ruhepuls über 90 Tage):
 * 2-px-Linie, 10-%-Flächenwash, Endpunkt-Marker mit Flächenring. */
export default function TrendLine({
  data,
  unit,
  color = chartColors.accent,
  height = 240,
}: {
  data: SeriesPoint[];
  unit: string;
  color?: string;
  height?: number;
}) {
  const points = data
    .filter((d) => d.value !== null)
    .map((d) => ({ ...d, tipLabel: unit }));
  if (points.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-ink-3">
        Noch nicht genug Daten für einen Verlauf — nach dem nächsten Import
        gibt es hier mehr zu sehen.
      </p>
    );
  }
  const last = points[points.length - 1];
  const gradId = `fill-${color.replace("#", "")}`;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 10, right: 14, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.13} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={chartColors.grid} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tick={{ fill: chartColors.axis, fontSize: 11 }}
            tickFormatter={(d: string) => fmtDayMonth(d)}
            interval={Math.max(0, Math.ceil(points.length / 6) - 1)}
            dy={6}
          />
          <YAxis
            domain={["dataMin - 2", "dataMax + 2"]}
            tickLine={false}
            axisLine={false}
            tick={{ fill: chartColors.axis, fontSize: 11 }}
            tickFormatter={(v: number) => `${Math.round(v)}`}
            width={40}
            tickCount={4}
          />
          <Tooltip
            cursor={{ stroke: "#c9c4b8", strokeWidth: 1 }}
            content={<ChartTip formatter={(v) => `${v}`.replace(".", ",")} />}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
            isAnimationActive={false}
          />
          <ReferenceDot
            x={last.day}
            y={last.value as number}
            r={4}
            fill={color}
            stroke="#ffffff"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
