"use client";

import { useMemo, useRef, useState } from "react";
import type { RoutePoint3D } from "@/modules/analytics/routes";
import {
  fmtDateShort,
  fmtDayMonth,
  fmtDuration,
  fmtInt,
  fmtKm,
  fmtKmh,
} from "@/modules/analytics/format";
import { chartColors } from "./theme";

/**
 * 3D-Vergleich einer Strecke: X = Datum, Y = Ø Herzfrequenz,
 * Z (vertikal) = Ø Geschwindigkeit.
 *
 * Eigene SVG-Turntable-Projektion statt einer 3D-Bibliothek: Der
 * Drehwinkel ist auf einen Quadranten begrenzt, dadurch bleiben die
 * Achsenbeschriftungen fest an ihren Kanten und springen beim Drehen
 * nicht um (das war die Plotly-Schwäche). Hover zeigt die Details der
 * nächstgelegenen Einheit.
 */

const W = 920;
const H = 520;
const CX = W / 2;
const CY = H / 2 - 10;
const S = 280;

// Drehbereich: ein Quadrant, in dem die Kantenzuordnung stabil ist
const THETA_MIN = -1.25;
const THETA_MAX = -0.15;
const PHI_MIN = 0.2;
const PHI_MAX = 1.1;

interface Mapped {
  u: number;
  v: number;
  w: number;
  p: RoutePoint3D;
}

export default function Scatter3D({ points }: { points: RoutePoint3D[] }) {
  const [rot, setRot] = useState({ theta: -0.62, phi: 0.42 });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    theta: number;
    phi: number;
    moved: boolean;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { mapped, dateTicks, hrTicks, speedTicks } = useMemo(
    () => mapPoints(points),
    [points]
  );

  const ct = Math.cos(rot.theta);
  const st = Math.sin(rot.theta);
  const cp = Math.cos(rot.phi);
  const sp = Math.sin(rot.phi);

  /** Einheitswürfel [-0.5, 0.5]³ -> Bildschirmkoordinaten */
  const proj = (u: number, v: number, w: number): [number, number, number] => {
    const ru = u * ct - v * st;
    const rv = u * st + v * ct;
    return [CX + ru * S, CY + rv * sp * S - w * cp * S, rv];
  };

  const projected = mapped.map((m) => proj(m.u, m.v, m.w));
  const drawOrder = projected
    .map((pt, i) => ({ i, depth: pt[2] }))
    .sort((a, b) => a.depth - b.depth); // hinten zuerst zeichnen

  // ------------------------------------------------------------ Interaktion

  const toViewBox = (e: React.PointerEvent): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * W,
      ((e.clientY - rect.top) / rect.height) * H,
    ];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ...rot, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current) {
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
      setRot({
        theta: clamp(drag.current.theta + dx * 0.006, THETA_MIN, THETA_MAX),
        phi: clamp(drag.current.phi + dy * 0.006, PHI_MIN, PHI_MAX),
      });
      return;
    }
    // Hover: nächstgelegener Punkt (Treffer-Radius 28 px im viewBox-Maß)
    const [mx, my] = toViewBox(e);
    let best: number | null = null;
    let bestD = 28;
    projected.forEach(([sx, sy], i) => {
      const d = Math.hypot(sx - mx, sy - my);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHoverIdx(best);
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  // ------------------------------------------------------------------ Chrome

  const gridColor = chartColors.grid;
  const axisText = "#9b968b";
  const ink = "#1a1a1a";

  const bottom = -0.5;
  const gridLines: string[] = [];
  for (const t of dateTicks) {
    gridLines.push(lineD(proj(t.pos, -0.5, bottom), proj(t.pos, 0.5, bottom)));
  }
  for (const t of hrTicks) {
    gridLines.push(lineD(proj(-0.5, t.pos, bottom), proj(0.5, t.pos, bottom)));
  }

  const hovered = hoverIdx !== null ? mapped[hoverIdx] : null;
  const hoveredXY = hoverIdx !== null ? projected[hoverIdx] : null;

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        style={{ cursor: drag.current ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setHoverIdx(null);
          drag.current = null;
        }}
      >
        {/* Bodenraster */}
        {gridLines.map((d, i) => (
          <path key={i} d={d} stroke={gridColor} strokeWidth={1} fill="none" />
        ))}
        {/* Bodenkanten + vertikale Achse */}
        <path d={lineD(proj(-0.5, -0.5, bottom), proj(0.5, -0.5, bottom))} stroke="#c3c2b7" strokeWidth={1} fill="none" />
        <path d={lineD(proj(0.5, -0.5, bottom), proj(0.5, 0.5, bottom))} stroke="#c3c2b7" strokeWidth={1} fill="none" />
        <path d={lineD(proj(-0.5, -0.5, bottom), proj(-0.5, -0.5, 0.5))} stroke="#c3c2b7" strokeWidth={1} fill="none" />

        {/* Datums-Ticks (vordere Kante) */}
        {dateTicks.map((t) => {
          const [x, y] = proj(t.pos, -0.56, bottom);
          return (
            <text key={t.label + t.pos} x={x} y={y + 14} textAnchor="middle" fontSize={11} fill={axisText}>
              {t.label}
            </text>
          );
        })}
        {/* Herzfrequenz-Ticks (rechte Kante) */}
        {hrTicks.map((t) => {
          const [x, y] = proj(0.56, t.pos, bottom);
          return (
            <text key={"hr" + t.pos} x={x + 4} y={y + 4} textAnchor="start" fontSize={11} fill={axisText}>
              {t.label}
            </text>
          );
        })}
        {/* Geschwindigkeits-Ticks (vertikale Achse links) */}
        {speedTicks.map((t) => {
          const [x, y] = proj(-0.52, -0.52, t.pos);
          return (
            <text key={"sp" + t.pos} x={x - 6} y={y + 4} textAnchor="end" fontSize={11} fill={axisText}>
              {t.label}
            </text>
          );
        })}

        {/* Achsentitel — feste Positionen, springen nie */}
        <AxisTitle at={proj(0, -0.78, bottom)} anchor="middle">Datum</AxisTitle>
        <AxisTitle at={proj(0.62, 0.28, bottom)} anchor="start">Ø Herzfrequenz (bpm)</AxisTitle>
        <AxisTitle at={proj(-0.5, -0.5, 0.68)} anchor="middle">Ø Geschwindigkeit (km/h)</AxisTitle>

        {/* Lotlinien zum Boden */}
        {mapped.map((m, i) => (
          <path
            key={"drop" + i}
            d={lineD(projected[i], proj(m.u, m.v, bottom))}
            stroke="#d9d4c8"
            strokeWidth={1}
            opacity={0.55}
            fill="none"
          />
        ))}

        {/* Chronologische Verbindungslinie */}
        <path
          d={projected.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ")}
          stroke="#d9d4c8"
          strokeWidth={1.5}
          fill="none"
        />

        {/* Punkte, von hinten nach vorn */}
        {drawOrder.map(({ i }) => {
          const [x, y] = projected[i];
          const isHover = i === hoverIdx;
          return (
            <circle
              key={"pt" + i}
              cx={x}
              cy={y}
              r={isHover ? 7 : 5}
              fill={chartColors.accent}
              stroke="#ffffff"
              strokeWidth={2}
            />
          );
        })}

        {/* Wert-Label am zuletzt gelaufenen Punkt */}
        {mapped.length > 0 && hoverIdx === null && (
          <text
            x={projected[projected.length - 1][0]}
            y={projected[projected.length - 1][1] - 12}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill={ink}
          >
            {fmtKmh(mapped[mapped.length - 1].p.speed!)}
          </text>
        )}
      </svg>

      {/* Tooltip */}
      {hovered && hoveredXY && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-black/5"
          style={{
            left: `${(hoveredXY[0] / W) * 100}%`,
            top: `${(hoveredXY[1] / H) * 100}%`,
            transform: "translate(-50%, -120%)",
          }}
        >
          <div className="mb-0.5 font-bold text-ink">{fmtDateShort(hovered.p.day)}</div>
          <div className="text-ink-2">
            <span className="font-bold text-ink">{fmtKmh(hovered.p.speed!)}</span>
            {hovered.p.pace && ` (${hovered.p.pace})`} · Ø {fmtInt(hovered.p.hr!)} bpm
          </div>
          {hovered.p.distanceKm !== undefined && (
            <div className="text-ink-3">
              {fmtKm(hovered.p.distanceKm)} · {fmtDuration(hovered.p.durationMin)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- Daten

function mapPoints(points: RoutePoint3D[]) {
  const pts = points.filter((p) => p.hr !== null && p.speed !== null);

  const times = pts.map((p) => Date.parse(p.date));
  const [t0, t1] = padDomain(Math.min(...times), Math.max(...times), 0.04);
  const hrs = pts.map((p) => p.hr!);
  const [h0, h1] = niceDomain(Math.min(...hrs), Math.max(...hrs));
  const speeds = pts.map((p) => p.speed!);
  const [s0, s1] = niceDomain(Math.min(...speeds), Math.max(...speeds));

  const norm = (val: number, lo: number, hi: number) =>
    hi === lo ? 0 : (val - lo) / (hi - lo) - 0.5;

  const mapped: Mapped[] = pts.map((p, i) => ({
    u: norm(times[i], t0, t1),
    v: norm(p.hr!, h0, h1),
    w: norm(p.speed!, s0, s1),
    p,
  }));

  const dateTicks = [0.12, 0.5, 0.88].map((f) => ({
    pos: f - 0.5,
    label: fmtDayMonth(
      new Date(t0 + f * (t1 - t0)).toISOString().slice(0, 10)
    ),
  }));
  const hrTicks = ticks(h0, h1, 4).map((val) => ({
    pos: norm(val, h0, h1),
    label: `${Math.round(val)}`,
  }));
  const speedTicks = ticks(s0, s1, 4).map((val) => ({
    pos: norm(val, s0, s1),
    label: `${Math.round(val * 10) / 10}`.replace(".", ","),
  }));

  return { mapped, dateTicks, hrTicks, speedTicks };
}

function padDomain(lo: number, hi: number, frac: number): [number, number] {
  const span = hi - lo || 1;
  return [lo - span * frac, hi + span * frac];
}

/** Auf runde Grenzen erweitern (Schrittweite 1/2/5 × 10^k). */
function niceDomain(lo: number, hi: number): [number, number] {
  const span = hi - lo || Math.max(1, Math.abs(hi) * 0.1);
  const step = niceStep(span / 4);
  return [Math.floor((lo - span * 0.05) / step) * step, Math.ceil((hi + span * 0.05) / step) * step];
}

function ticks(lo: number, hi: number, count: number): number[] {
  const step = niceStep((hi - lo) / count);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
  return out;
}

function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
  const n = raw / mag;
  return (n >= 5 ? 10 : n >= 2 ? 5 : n >= 1 ? 2 : 1) * mag;
}

function lineD(a: [number, number, number?], b: [number, number, number?]): string {
  return `M${a[0]},${a[1]} L${b[0]},${b[1]}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function AxisTitle({
  at,
  anchor,
  children,
}: {
  at: [number, number, number?];
  anchor: "start" | "middle" | "end";
  children: string;
}) {
  return (
    <text
      x={at[0]}
      y={at[1]}
      textAnchor={anchor}
      fontSize={12}
      fontWeight={600}
      fill="#6e6a61"
    >
      {children}
    </text>
  );
}
