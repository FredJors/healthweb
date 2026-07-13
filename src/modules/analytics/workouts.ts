import type { Workout, WorkoutType } from "@/modules/health-model/types";
import { fmtKmh, fmtPace } from "./format";

/** Deutsche Bezeichnungen der Workout-Typen. */
export const WORKOUT_LABEL: Record<WorkoutType, string> = {
  running: "Laufen",
  cycling: "Radfahren",
  walking: "Gehen",
  hiking: "Wandern",
  swimming: "Schwimmen",
  strength: "Krafttraining",
  hiit: "HIIT",
  yoga: "Yoga",
  rowing: "Rudern",
  other: "Training",
};

/** Typen, bei denen Tempo als Pace (min/km) gelesen wird — sonst km/h. */
const PACE_TYPES: ReadonlySet<WorkoutType> = new Set([
  "running",
  "walking",
  "hiking",
]);
const SPEED_TYPES: ReadonlySet<WorkoutType> = new Set(["cycling", "rowing"]);

export interface WorkoutTrend {
  /** Prozent Abweichung des Tempos gegenüber dem Schnitt der letzten
   * gleichartigen Workouts; positiv = besser (schneller). */
  pct: number;
  better: boolean;
}

export interface WorkoutView extends Workout {
  label: string;
  /** "5:32 /km" bzw. "24,3 km/h", falls sinnvoll */
  tempo?: string;
  trend?: WorkoutTrend;
}

export function paceMinPerKm(w: Workout): number | undefined {
  if (!w.distanceKm || w.distanceKm < 0.5) return undefined;
  return w.durationMin / w.distanceKm;
}

export function speedKmh(w: Workout): number | undefined {
  if (!w.distanceKm || w.distanceKm < 0.5 || w.durationMin <= 0)
    return undefined;
  return w.distanceKm / (w.durationMin / 60);
}

/**
 * Reichert Workouts (aufsteigend nach Datum erwartet) um Tempo und Trend an.
 * Trend = Tempo im Vergleich zum Schnitt der bis zu 10 vorherigen Workouts
 * gleichen Typs — die Basis für die späteren Vergleichs-Features.
 */
export function buildWorkoutViews(ascending: Workout[]): WorkoutView[] {
  const history = new Map<WorkoutType, number[]>(); // bisherige Tempowerte

  return ascending.map((w) => {
    const view: WorkoutView = { ...w, label: WORKOUT_LABEL[w.type] };

    const isPace = PACE_TYPES.has(w.type);
    const isSpeed = SPEED_TYPES.has(w.type);
    const value = isPace ? paceMinPerKm(w) : isSpeed ? speedKmh(w) : undefined;

    if (value !== undefined) {
      view.tempo = isPace ? fmtPace(value) : fmtKmh(value);

      const prev = history.get(w.type) ?? [];
      if (prev.length >= 2) {
        const recent = prev.slice(-10);
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        // Bei Pace ist kleiner = schneller, bei km/h ist größer = schneller
        const betterPct = isPace
          ? ((avg - value) / avg) * 100
          : ((value - avg) / avg) * 100;
        if (Math.abs(betterPct) >= 0.5) {
          view.trend = {
            pct: Math.round(Math.abs(betterPct)),
            better: betterPct > 0,
          };
        }
      }
      prev.push(value);
      history.set(w.type, prev);
    }

    return view;
  });
}
