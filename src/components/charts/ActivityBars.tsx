"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "@/modules/analytics/dashboard";
import { chartColors } from "./theme";
import ChartTip from "./ChartTip";
import { fmtInt } from "@/modules/analytics/format";

/** Balkenreihe (z. B. Schritte pro Tag oder Minuten pro Woche); der
 * hervorgehobene Balken ist direkt beschriftet, alle Werte zusätzlich
 * per Tooltip erreichbar. */
export default function ActivityBars({
  data,
  highlightDay,
  tipLabel = "Schritte",
  formatter = fmtInt,
}: {
  data: SeriesPoint[];
  highlightDay: string | null;
  tipLabel?: string;
  formatter?: (v: number) => string;
}) {
  const chartData = data.map((d) => ({
    ...d,
    value: d.value ?? 0,
    tipLabel,
  }));
  const highlightIndex = chartData.findIndex((d) => d.day === highlightDay);

  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 22, right: 4, left: -14, bottom: 0 }}
          barCategoryGap="32%"
        >
          <CartesianGrid vertical={false} stroke={chartColors.grid} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: chartColors.axis, fontSize: 11 }}
            dy={6}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: chartColors.axis, fontSize: 11 }}
            tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : `${v}`)}
            width={44}
            tickCount={3}
          />
          <Tooltip
            cursor={{ fill: chartColors.cursor }}
            content={<ChartTip formatter={formatter} />}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false}>
            {chartData.map((d) => (
              <Cell
                key={d.day}
                fill={d.day === highlightDay ? chartColors.accent : chartColors.muted}
              />
            ))}
            <LabelList
              dataKey="value"
              content={(props) => {
                const { x, y, width, value, index } = props as {
                  x?: number;
                  y?: number;
                  width?: number;
                  value?: number;
                  index?: number;
                };
                if (
                  index !== highlightIndex ||
                  x === undefined ||
                  y === undefined ||
                  width === undefined ||
                  !value
                )
                  return null;
                return (
                  <text
                    x={x + width / 2}
                    y={y - 8}
                    textAnchor="middle"
                    fill="#1a1a1a"
                    fontSize={11}
                    fontWeight={700}
                  >
                    {formatter(value)}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
