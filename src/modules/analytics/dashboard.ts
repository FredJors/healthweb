import { db, getLatestImport } from "@/modules/storage/db";
import type {
  DailyMetric,
  MetricKey,
  SleepNight,
} from "@/modules/health-model/types";
import type { SourceId } from "@/modules/ingestion/types";
import { addDays, lastNDays, weekdayLetter } from "./dates";
import { fmtDateShort } from "./format";
import { buildWorkoutViews, type WorkoutView } from "./workouts";

export interface SeriesPoint {
  day: string;
  /** Kurzes Achsen-Label */
  label: string;
  /** Volles Label für den Tooltip */
  full: string;
  value: number | null;
}

export interface DashboardData {
  /** Letzter Tag mit Daten — "heute" aus Sicht des Exports */
  refDay: string;
  source: SourceId;
  importedAt: string;
  week: {
    energyKcal: number;
    energyDeltaPct: number | null;
    workouts: number;
    distanceKm: number;
    durationMin: number;
    energySeries: SeriesPoint[];
  };
  steps: {
    today: number | null;
    avg30: number | null;
    series14: SeriesPoint[];
    bestDay: string | null;
  };
  restingHR: {
    current: number | null;
    deltaVs30: number | null;
    series90: SeriesPoint[];
    spark: SeriesPoint[];
  };
  hrv: {
    current: number | null;
    deltaVs30: number | null;
    spark: SeriesPoint[];
  };
  sleep: {
    lastNight: SleepNight | null;
    avg14Min: number | null;
  };
  recentWorkouts: WorkoutView[];
}

/** Lädt alles, was das Dashboard braucht; null = noch keine Daten importiert. */
export async function loadDashboardData(): Promise<DashboardData | null> {
  const latest = await getLatestImport();
  if (!latest) return null;

  const lastMetric = await db.dailyMetrics.orderBy("day").last();
  const lastWorkout = await db.workouts.orderBy("day").last();
  const refDay =
    [lastMetric?.day, lastWorkout?.day].filter(Boolean).sort().pop() ?? null;
  if (!refDay) return null;

  const [steps90, energy90, resting90, hrv90] = await Promise.all([
    metricRange("steps", addDays(refDay, -89), refDay),
    metricRange("activeEnergy", addDays(refDay, -89), refDay),
    metricRange("restingHR", addDays(refDay, -89), refDay),
    metricRange("hrv", addDays(refDay, -89), refDay),
  ]);

  // ---- Woche (letzte 7 Tage inkl. refDay)
  const weekStart = addDays(refDay, -6);
  const prevWeekStart = addDays(refDay, -13);
  const energyThisWeek = sumRange(energy90, weekStart, refDay);
  const energyPrevWeek = sumRange(energy90, prevWeekStart, addDays(weekStart, -1));

  const weekWorkoutsRaw = await db.workouts
    .where("day")
    .between(weekStart, refDay, true, true)
    .toArray();

  // ---- Workouts gesamt (für Trends braucht jede Zeile ihre Vorgeschichte)
  const allWorkouts = await db.workouts.orderBy("startDate").toArray();
  const views = buildWorkoutViews(allWorkouts);
  const recentWorkouts = views.slice(-5).reverse();

  // ---- Schlaf
  const lastNight = await db.sleepNights.orderBy("day").last();
  const sleep14 = await db.sleepNights
    .where("day")
    .between(addDays(refDay, -13), refDay, true, true)
    .toArray();
  const avg14Min = sleep14.length
    ? sleep14.reduce((a, s) => a + s.asleepMin, 0) / sleep14.length
    : null;

  return {
    refDay,
    source: latest.source,
    importedAt: latest.importedAt,
    week: {
      energyKcal: Math.round(energyThisWeek),
      energyDeltaPct:
        energyPrevWeek > 0
          ? Math.round(((energyThisWeek - energyPrevWeek) / energyPrevWeek) * 100)
          : null,
      workouts: weekWorkoutsRaw.length,
      distanceKm: weekWorkoutsRaw.reduce((a, w) => a + (w.distanceKm ?? 0), 0),
      durationMin: weekWorkoutsRaw.reduce((a, w) => a + w.durationMin, 0),
      energySeries: toSeries(energy90, lastNDays(refDay, 14)),
    },
    steps: {
      today: steps90.get(refDay)?.value ?? null,
      avg30: avgRange(steps90, addDays(refDay, -29), refDay),
      series14: toSeries(steps90, lastNDays(refDay, 14)),
      bestDay: bestDayOf(steps90, lastNDays(refDay, 14)),
    },
    restingHR: {
      current: latestValue(resting90),
      deltaVs30: deltaVsAvg(resting90, refDay),
      series90: toSeries(resting90, lastNDays(refDay, 90), true),
      spark: toSeries(resting90, lastNDays(refDay, 30), true),
    },
    hrv: {
      current: latestValue(hrv90),
      deltaVs30: deltaVsAvg(hrv90, refDay),
      spark: toSeries(hrv90, lastNDays(refDay, 30), true),
    },
    sleep: {
      lastNight: lastNight ?? null,
      avg14Min,
    },
    recentWorkouts,
  };
}

// ------------------------------------------------------------------ Helfer

async function metricRange(
  metric: MetricKey,
  from: string,
  to: string
): Promise<Map<string, DailyMetric>> {
  const rows = await db.dailyMetrics
    .where("[metric+day]")
    .between([metric, from], [metric, to], true, true)
    .toArray();
  return new Map(rows.map((r) => [r.day, r]));
}

function sumRange(map: Map<string, DailyMetric>, from: string, to: string): number {
  let sum = 0;
  for (const [day, m] of map) if (day >= from && day <= to) sum += m.value;
  return sum;
}

function avgRange(
  map: Map<string, DailyMetric>,
  from: string,
  to: string
): number | null {
  let sum = 0;
  let count = 0;
  for (const [day, m] of map)
    if (day >= from && day <= to) {
      sum += m.value;
      count++;
    }
  return count ? sum / count : null;
}

function latestValue(map: Map<string, DailyMetric>): number | null {
  const days = [...map.keys()].sort();
  const last = days[days.length - 1];
  return last ? map.get(last)!.value : null;
}

/** Differenz des letzten Werts zum 30-Tage-Schnitt (absolut, gerundet auf 1). */
function deltaVsAvg(map: Map<string, DailyMetric>, refDay: string): number | null {
  const current = latestValue(map);
  const avg = avgRange(map, addDays(refDay, -29), refDay);
  if (current === null || avg === null) return null;
  return Math.round((current - avg) * 10) / 10;
}

function toSeries(
  map: Map<string, DailyMetric>,
  days: string[],
  skipGaps = false
): SeriesPoint[] {
  const points = days.map((day) => ({
    day,
    label: weekdayLetter(day),
    full: fmtDateShort(day),
    value: map.get(day)?.value ?? null,
  }));
  return skipGaps ? points.filter((p) => p.value !== null) : points;
}

function bestDayOf(map: Map<string, DailyMetric>, days: string[]): string | null {
  let best: string | null = null;
  let bestVal = -1;
  for (const day of days) {
    const v = map.get(day)?.value;
    if (v !== undefined && v > bestVal) {
      bestVal = v;
      best = day;
    }
  }
  return best;
}
