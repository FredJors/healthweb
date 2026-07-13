"use client";

import type { LucideIcon } from "lucide-react";
import type { SeriesPoint } from "@/modules/analytics/dashboard";
import Card from "@/components/ui/Card";
import Sparkline from "@/components/charts/Sparkline";
import { chartColors } from "@/components/charts/theme";

/** Stat-Kachel: Label · Wert · Delta (Richtung × ob "hoch" gut ist) · Sparkline. */
export default function StatTile({
  icon: Icon,
  iconClass = "bg-accent-soft text-accent",
  label,
  value,
  unit,
  delta,
  deltaSuffix = "",
  upIsGood = true,
  deltaLabel = "ggü. Ø 30 Tage",
  spark,
}: {
  icon: LucideIcon;
  iconClass?: string;
  label: string;
  value: string;
  unit?: string;
  delta?: number | null;
  deltaSuffix?: string;
  upIsGood?: boolean;
  deltaLabel?: string;
  spark?: SeriesPoint[];
}) {
  const showDelta = delta !== undefined && delta !== null && delta !== 0;
  const good = showDelta ? (delta > 0) === upIsGood : true;

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${iconClass}`}
        >
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-ink-3">{label}</div>
          <div className="mt-0.5 text-2xl font-extrabold text-ink">
            {value}
            {unit && (
              <span className="ml-1 text-sm font-bold text-ink-3">{unit}</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        {showDelta ? (
          <div className="text-[11px] leading-tight">
            <span
              className={`rounded-full px-2 py-0.5 font-bold ${
                good ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"
              }`}
            >
              {delta > 0 ? "▲" : "▼"} {String(Math.abs(delta)).replace(".", ",")}
              {deltaSuffix}
            </span>
            <span className="ml-1.5 text-ink-3">{deltaLabel}</span>
          </div>
        ) : (
          <span />
        )}
        {spark && spark.length > 1 && (
          <div className="w-24 shrink-0">
            <Sparkline data={spark} color={chartColors.muted} height={30} />
          </div>
        )}
      </div>
    </Card>
  );
}
