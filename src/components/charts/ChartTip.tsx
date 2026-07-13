"use client";

/** Einheitlicher Tooltip: Wert führt (fett), Serienname folgt,
 * Serien-Key als kurzer Farbstrich. */
export default function ChartTip({
  active,
  payload,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number | null;
    color?: string;
    payload?: { full?: string; fill?: string; tipLabel?: string };
  }>;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const full = payload[0]?.payload?.full;

  return (
    <div className="rounded-xl bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-black/5">
      {full && <div className="mb-1 text-ink-3">{full}</div>}
      {payload.map((p, i) =>
        p.value === null || p.value === undefined ? null : (
          <div key={i} className="flex items-center gap-2">
            <span
              className="h-[3px] w-3 rounded-full"
              style={{ background: p.color ?? p.payload?.fill ?? "#1a1a1a" }}
            />
            <span className="text-sm font-bold text-ink">
              {formatter ? formatter(p.value) : p.value}
            </span>
            {(p.payload?.tipLabel ?? p.name) && (
              <span className="text-ink-2">{p.payload?.tipLabel ?? p.name}</span>
            )}
          </div>
        )
      )}
    </div>
  );
}
