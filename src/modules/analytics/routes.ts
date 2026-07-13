import type {
  Workout,
  WorkoutRoute,
  WorkoutType,
} from "@/modules/health-model/types";
import { distM } from "@/modules/ingestion/apple-health-export/gpx";
import { paceMinPerKm, speedKmh, WORKOUT_LABEL } from "./workouts";
import { fmtPace } from "./format";

/**
 * Strecken-Erkennung: Routen werden in ein Raster aus ~165-m-Zellen zerlegt;
 * zwei Routen gelten als dieselbe Strecke, wenn der Kernbereich (die Zellmenge)
 * stark überlappt. Unterschiedliche Start-/Endpunkte oder die Fahrtrichtung
 * spielen dadurch keine Rolle.
 */

const CELL_DEG = 0.0015; // ≈ 165 m in Nord-Süd-Richtung
const SAMPLE_DEG = CELL_DEG / 2; // Abtastschritt entlang der Route
/** Anteil der Zellen einer Route, der von der Gruppe abgedeckt sein muss */
const OVERLAP_THRESHOLD = 0.7;

export interface RoutePoint3D {
  day: string;
  /** ISO-Datum für die Plot-X-Achse */
  date: string;
  hr: number | null;
  /** Ø km/h */
  speed: number | null;
  distanceKm?: number;
  durationMin: number;
  /** "5:32 /km" bei Laufsport, sonst undefined */
  pace?: string;
}

export interface RouteGroup {
  id: number;
  type: WorkoutType;
  label: string;
  count: number;
  medianKm: number;
  /** Ø km/h über alle Einheiten mit Distanz */
  avgSpeed: number | null;
  routes: WorkoutRoute[];
  /** chronologisch aufsteigend, für den 3D-Vergleich */
  points3d: RoutePoint3D[];
}

/** Gruppiert Routen zu Strecken und reichert sie mit Workout-Daten an. */
export function buildRouteGroups(
  routes: WorkoutRoute[],
  workouts: Workout[]
): RouteGroup[] {
  const byStart = new Map(workouts.map((w) => [w.startDate, w]));

  // Größte Route zuerst als Gruppen-Anker, damit kürzere Varianten
  // derselben Strecke sich einsortieren können.
  const withCells = routes
    .map((route) => ({ route, cells: cellsOf(route.points) }))
    .filter((r) => r.cells.size >= 3)
    .sort((a, b) => b.cells.size - a.cells.size);

  interface Cluster {
    type: WorkoutType;
    union: Set<string>;
    members: Array<{ route: WorkoutRoute; cells: Set<string> }>;
  }
  const clusters: Cluster[] = [];

  for (const item of withCells) {
    let joined = false;
    for (const cluster of clusters) {
      if (cluster.type !== item.route.type) continue;
      if (overlap(item.cells, cluster.union) >= OVERLAP_THRESHOLD) {
        cluster.members.push(item);
        for (const c of item.cells) cluster.union.add(c);
        joined = true;
        break;
      }
    }
    if (!joined) {
      clusters.push({
        type: item.route.type,
        union: new Set(item.cells),
        members: [item],
      });
    }
  }

  const groups = clusters
    .map((cluster, i): RouteGroup => {
      const members = cluster.members.map((m) => m.route);
      const points3d = members
        .map((route) => toPoint3D(route, byStart.get(route.workoutStart)))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      const speeds = points3d
        .map((p) => p.speed)
        .filter((v): v is number => v !== null);
      return {
        id: i,
        type: cluster.type,
        label: WORKOUT_LABEL[cluster.type],
        count: members.length,
        medianKm: median(members.map((r) => r.lengthKm)),
        avgSpeed: speeds.length
          ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10
          : null,
        routes: members,
        points3d,
      };
    })
    .sort((a, b) => b.count - a.count);

  // stabile IDs nach der Sortierung
  groups.forEach((g, i) => (g.id = i));
  return groups;
}

/** Zellmenge einer Route; Segmente werden abgetastet, damit auch
 * ausgedünnte Punktfolgen lückenlose Zellspuren ergeben.
 *
 * Wichtig: Die Längengrad-Skalierung wird pro Raster-Zeile (Breitengrad-Band)
 * bestimmt, nie pro Route — sonst bekämen zwei Aufzeichnungen derselben
 * Strecke mit unterschiedlichem Startpunkt verschobene Zellraster und
 * würden nicht zusammenfinden. */
const rowScaleCache = new Map<number, number>();

function rowScale(row: number): number {
  let s = rowScaleCache.get(row);
  if (s === undefined) {
    s = Math.cos((((row + 0.5) * CELL_DEG) * Math.PI) / 180);
    rowScaleCache.set(row, s);
  }
  return s;
}

export function cellsOf(points: Array<[number, number]>): Set<string> {
  const cells = new Set<string>();
  if (!points.length) return cells;

  const add = (lat: number, lon: number) => {
    const row = Math.floor(lat / CELL_DEG);
    cells.add(`${Math.floor((lon * rowScale(row)) / CELL_DEG)}:${row}`);
  };

  const lonSpanScale = rowScale(Math.floor(points[0][0] / CELL_DEG));
  add(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const [aLat, aLon] = points[i - 1];
    const [bLat, bLon] = points[i];
    const span = Math.max(
      Math.abs(bLat - aLat),
      Math.abs((bLon - aLon) * lonSpanScale)
    );
    const steps = Math.max(1, Math.ceil(span / SAMPLE_DEG));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      add(aLat + (bLat - aLat) * t, aLon + (bLon - aLon) * t);
    }
  }
  return cells;
}

/** Anteil der Zellen von `cells`, die `reference` bereits abdeckt. */
function overlap(cells: Set<string>, reference: Set<string>): number {
  let hit = 0;
  for (const c of cells) if (reference.has(c)) hit++;
  return hit / cells.size;
}

function toPoint3D(route: WorkoutRoute, workout?: Workout): RoutePoint3D {
  const distanceKm = workout?.distanceKm ?? route.lengthKm;
  const durationMin = workout?.durationMin ?? 0;
  const speed =
    workout && workout.distanceKm
      ? (speedKmh(workout) ?? null)
      : durationMin > 0 && route.lengthKm > 0.3
        ? Math.round((route.lengthKm / (durationMin / 60)) * 10) / 10
        : null;
  const paceVal = workout ? paceMinPerKm(workout) : undefined;

  return {
    day: route.day,
    date: route.workoutStart.slice(0, 10),
    hr: workout?.avgHeartRate ?? null,
    speed: speed !== null ? Math.round(speed * 10) / 10 : null,
    distanceKm,
    durationMin,
    pace:
      paceVal !== undefined &&
      (route.type === "running" || route.type === "walking" || route.type === "hiking")
        ? fmtPace(paceVal)
        : undefined,
  };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(m * 10) / 10;
}

/** Gesamt-Boundingbox mehrerer Routen (für das Karten-Fitting). */
export function boundsOf(
  routes: WorkoutRoute[]
): [[number, number], [number, number]] | null {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const r of routes) {
    for (const [lat, lon] of r.points) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
  }
  if (!isFinite(minLat)) return null;
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}

/** Grobe Distanz-Kennzahl für Debug/Sortierung. */
export function routeLengthKm(points: Array<[number, number]>): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += distM(points[i - 1], points[i]);
  return Math.round((m / 1000) * 100) / 100;
}
