import type { Workout } from "@/modules/health-model/types";

/**
 * Trainingslast nach dem TRIMP-Prinzip: Dauer × Intensität, wobei die
 * Intensität aus der Herzfrequenz-Reserve kommt (wie stark der Puls im
 * Workout relativ zwischen Ruhepuls und Maximum lag). Die Einheit ist
 * bewusst abstrakt ("Belastungspunkte") — es zählen nur Verhältnisse:
 * akute Last (7 Tage) gegen die chronische Grundlast (28 Tage), das
 * klassische ACWR-Modell aus der Trainingswissenschaft.
 */

/** Intensität eines Workouts als Anteil der Herzfrequenz-Reserve (0.25–1). */
export function workoutIntensity(
  w: Workout,
  restingHR: number | null,
  maxHR: number | null
): number {
  if (
    w.avgHeartRate !== undefined &&
    restingHR !== null &&
    maxHR !== null &&
    maxHR > restingHR + 20
  ) {
    const hrr = (w.avgHeartRate - restingHR) / (maxHR - restingHR);
    return Math.min(1, Math.max(0.25, hrr));
  }
  return 0.55; // ohne Pulsdaten: moderate Einheit annehmen
}

export function workoutLoad(
  w: Workout,
  restingHR: number | null,
  maxHR: number | null
): number {
  return w.durationMin * workoutIntensity(w, restingHR, maxHR);
}

/** Tageslasten aufsummieren. */
export function dailyLoads(
  workouts: Workout[],
  restingHR: number | null,
  maxHR: number | null
): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of workouts) {
    out.set(w.day, (out.get(w.day) ?? 0) + workoutLoad(w, restingHR, maxHR));
  }
  return out;
}

/** Gleitender Mittelwert der Tageslast über `window` Tage (fehlende Tage = 0). */
export function rollingLoad(
  loads: Map<string, number>,
  days: string[],
  window: number
): number[] {
  const values = days.map((d) => loads.get(d) ?? 0);
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(sum / Math.min(i + 1, window));
  }
  return out;
}

export type LoadStatus = "low" | "optimal" | "high" | "unknown";

/** ACWR einordnen: 0,8–1,3 gilt als ausgewogener Bereich. */
export function loadStatus(acwr: number | null): LoadStatus {
  if (acwr === null) return "unknown";
  if (acwr > 1.35) return "high";
  if (acwr < 0.8) return "low";
  return "optimal";
}
