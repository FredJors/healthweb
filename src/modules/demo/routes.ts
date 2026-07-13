import type { WorkoutRoute, WorkoutType } from "@/modules/health-model/types";
import { routeLengthKm } from "@/modules/analytics/routes";

/**
 * Synthetische GPS-Routen für die Demo-Daten (Raum Braunschweig):
 * eine Pendelstrecke zur Uni, eine Elm-Runde fürs Rennrad, eine Parkrunde
 * und ein Fluss-Lauf. Jede Instanz bekommt leichtes GPS-Zittern und einen
 * zufälligen Startversatz — genau das, was die Strecken-Erkennung
 * zusammenführen muss.
 */

export type DemoRouteKind = "commute" | "elm" | "parkRun" | "riverRun";

type RND = () => number;

const JITTER_DEG = 0.00012; // ~13 m GPS-Rauschen

/** Erzeugt die Punktfolge einer Demo-Route; lengthKm ist die echte Pfadlänge. */
export function demoRoute(
  kind: DemoRouteKind,
  rnd: RND,
  opts?: { laps?: number; halfKm?: number }
): { points: Array<[number, number]>; lengthKm: number } {
  let points: Array<[number, number]>;

  switch (kind) {
    case "commute":
      points = path(COMMUTE_WAYPOINTS, rnd, rnd() > 0.5);
      break;
    case "elm":
      points = loop([52.208, 10.91], 31, 4.2, rnd, opts?.laps ?? 1);
      break;
    case "parkRun":
      points = loop([52.2455, 10.5215], 2.5, 1.7, rnd, opts?.laps ?? 2);
      break;
    case "riverRun":
      points = outAndBack([52.238, 10.5185], opts?.halfKm ?? 5.5, rnd);
      break;
  }

  return { points, lengthKm: routeLengthKm(points) };
}

// ------------------------------------------------------------------ Formen

const COMMUTE_WAYPOINTS: Array<[number, number]> = [
  [52.245, 10.49], // "Zuhause"
  [52.2482, 10.4925],
  [52.2504, 10.4978],
  [52.2531, 10.5008],
  [52.2549, 10.5065],
  [52.2585, 10.5092],
  [52.2611, 10.5148],
  [52.2649, 10.5178],
  [52.2672, 10.5231],
  [52.2704, 10.5262],
  [52.2735, 10.53], // "Uni"
];

/** Wegpunkte verdichten (~40-m-Schritte), jittern, optional umdrehen. */
function path(
  waypoints: Array<[number, number]>,
  rnd: RND,
  reversed: boolean
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 1; i < waypoints.length; i++) {
    const [aLat, aLon] = waypoints[i - 1];
    const [bLat, bLon] = waypoints[i];
    const steps = Math.max(
      2,
      Math.round(Math.hypot(bLat - aLat, (bLon - aLon) * 0.61) / 0.00036)
    );
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      pts.push(
        jitter([aLat + (bLat - aLat) * t, aLon + (bLon - aLon) * t], rnd)
      );
    }
  }
  pts.push(jitter(waypoints[waypoints.length - 1], rnd));
  if (reversed) pts.reverse();
  // Startversatz: mal ein Stück früher/später losgetrackt
  return pts.slice(Math.floor(rnd() * pts.length * 0.06));
}

/**
 * Unregelmäßige Schleife mit fester Form (wobble hängt vom absoluten Winkel
 * ab, nicht vom Startpunkt) — Startwinkel, Richtung und Rundenzahl variieren.
 */
function loop(
  center: [number, number],
  perimeterKm: number,
  shapeSeed: number,
  rnd: RND,
  laps: number
): Array<[number, number]> {
  const rKm = perimeterKm / (2 * Math.PI);
  const latR = rKm / 110.574;
  const lonR = rKm / (111.32 * Math.cos((center[0] * Math.PI) / 180));
  const n = 110;
  const startAngle = rnd() * 2 * Math.PI;
  const dir = rnd() > 0.5 ? 1 : -1;

  const pts: Array<[number, number]> = [];
  for (let lap = 0; lap < laps; lap++) {
    for (let i = 0; i < n; i++) {
      const angle = startAngle + dir * 2 * Math.PI * (i / n);
      const wobble =
        1 +
        0.18 * Math.sin(3 * angle + shapeSeed) +
        0.09 * Math.sin(7 * angle + 2 * shapeSeed);
      pts.push(
        jitter(
          [
            center[0] + latR * wobble * Math.sin(angle),
            center[1] + lonR * wobble * Math.cos(angle),
          ],
          rnd
        )
      );
    }
  }
  pts.push(pts[0]);
  return pts;
}

/** Hin-und-zurück-Strecke entlang einer leicht geschwungenen Linie. */
function outAndBack(
  start: [number, number],
  halfKm: number,
  rnd: RND
): Array<[number, number]> {
  const n = 70;
  const dLat = halfKm / 110.574;
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(
      jitter(
        [
          start[0] + dLat * t,
          start[1] + 0.004 * Math.sin(t * Math.PI * 1.6), // Flusslauf-Schwung
        ],
        rnd
      )
    );
  }
  const back = [...out]
    .reverse()
    .map((p): [number, number] => jitter([p[0], p[1] + 0.00008], rnd));
  const full = [...out, ...back];
  return full.slice(Math.floor(rnd() * 6));
}

function jitter(p: [number, number], rnd: RND): [number, number] {
  return [
    Math.round((p[0] + (rnd() - 0.5) * JITTER_DEG) * 100000) / 100000,
    Math.round((p[1] + (rnd() - 0.5) * JITTER_DEG) * 100000) / 100000,
  ];
}

/** Welche Routenform passt zu welchem Demo-Workout? */
export function routeKindFor(
  type: WorkoutType,
  variant: "short" | "long"
): DemoRouteKind | null {
  if (type === "running") return variant === "long" ? "riverRun" : "parkRun";
  if (type === "cycling") return variant === "long" ? "elm" : "commute";
  return null;
}

export function makeDemoRoute(
  workoutStart: string,
  day: string,
  type: WorkoutType,
  kind: DemoRouteKind,
  rnd: RND,
  opts?: { laps?: number; halfKm?: number }
): WorkoutRoute {
  const { points, lengthKm } = demoRoute(kind, rnd, opts);
  return { workoutStart, day, type, points, lengthKm };
}
