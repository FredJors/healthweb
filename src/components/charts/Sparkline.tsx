"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";
import type { SeriesPoint } from "@/modules/analytics/dashboard";

/** Kleine kontextlose Trendlinie für Stat-Kacheln und die Hero-Karte. */
export default function Sparkline({
  data,
  color,
  height = 36,
}: {
  data: SeriesPoint[];
  color: string;
  height?: number;
}) {
  const points = data.filter((d) => d.value !== null);
  if (points.length < 2) return null;

  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
