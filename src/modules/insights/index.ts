import { db, getLatestImport } from "@/modules/storage/db";
import type { DailyMetric, MetricKey } from "@/modules/health-model/types";
import { addDays, lastNDays, todayKey } from "@/modules/analytics/dates";
import { fmtDateShort, fmtDayMonth } from "@/modules/analytics/format";
import { buildRouteGroups } from "@/modules/analytics/routes";
import type { SeriesPoint } from "@/modules/analytics/dashboard";
import { dailyLoads, loadStatus, rollingLoad, type LoadStatus } from "./load";
import { computeRecovery, type RecoveryResult } from "./recovery";
import { buildSuggestions, type Suggestion } from "./suggest";

export interface LoadPoint {
  day: string;
  full: string;
  /** Ø Tageslast der letzten 7 Tage */
  acute: number;
  /** Ø Tageslast der letzten 28 Tage (Grundlast) */
  chronic: number;
}

export interface InsightsData {
  refDay: string;
  /** Tage zwischen letztem Datentag und echtem Heute */
  staleDays: number;
  suggestion: Suggestion;
  alternative: Suggestion | null;
  acwr: number | null;
  status: LoadStatus;
  acute: number;
  chronic: number;
  recovery: RecoveryResult;
  /** letzte 84 Tage */
  loadSeries: LoadPoint[];
  /** letzte 8 Wochen, value = Trainingsminuten */
  weeklyMinutes: SeriesPoint[];
  currentWeekStart: string;
  maxHR: number | null;
}

/** Lädt und berechnet alles für die Trainings-Seite; null = keine Daten. */
export async function loadInsights(): Promise<InsightsData | null> {
  const latest = await getLatestImport();
  if (!latest) return null;

  const workouts = await db.workouts.orderBy("startDate").toArray();
  const lastMetricDay = (await db.dailyMetrics.orderBy("day").last())?.day;
  const lastWorkoutDay = workouts[workouts.length - 1]?.day;
  const refDay =
    [lastMetricDay, lastWorkoutDay].filter(Boolean).sort().pop() ?? null;
  if (!refDay) return null;

  const today = todayKey();
  const staleDays = Math.max(0, diffDays(refDay, today));

  const [resting, hrv] = await Promise.all([
    metricRange("restingHR", addDays(refDay, -29), refDay),
    metricRange("hrv", addDays(refDay, -29), refDay),
  ]);
  const restingAvg30 = avgOf(resting);
  const restingCurrent = latestOf(resting);
  const lastNight = await db.sleepNights.orderBy("day").last();
  const sleep14 = await db.sleepNights
    .where("day")
    .between(addDays(refDay, -13), refDay, true, true)
    .toArray();

  const recovery = computeRecovery({
    restingCurrent,
    restingAvg30,
    hrvCurrent: latestOf(hrv),
    hrvAvg30: avgOf(hrv),
    sleepLastMin: lastNight?.asleepMin ?? null,
    sleepAvg14Min: sleep14.length
      ? sleep14.reduce((a, s) => a + s.asleepMin, 0) / sleep14.length
      : null,
  });

  let maxHR: number | null = null;
  for (const w of workouts) {
    if (w.maxHeartRate !== undefined && (maxHR === null || w.maxHeartRate > maxHR))
      maxHR = w.maxHeartRate;
  }
  if (maxHR !== null && maxHR < 120) maxHR = null;

  // Lastkurven: 28 Tage Anlauf vor dem 84-Tage-Fenster mitrechnen
  const loads = dailyLoads(workouts, restingAvg30, maxHR);
  const days = lastNDays(refDay, 112);
  const acuteArr = rollingLoad(loads, days, 7);
  const chronicArr = rollingLoad(loads, days, 28);

  const loadSeries: LoadPoint[] = days.slice(-84).map((day, i) => ({
    day,
    full: fmtDateShort(day),
    acute: round1(acuteArr[i + 28]),
    chronic: round1(chronicArr[i + 28]),
  }));

  const acute = acuteArr[acuteArr.length - 1];
  const chronic = chronicArr[chronicArr.length - 1];
  const acwr = chronic >= 3 ? Math.round((acute / chronic) * 100) / 100 : null;

  const routes = await db.routes.toArray();
  const routeGroups = buildRouteGroups(routes, workouts);

  const daysSinceLastWorkout = lastWorkoutDay
    ? diffDays(lastWorkoutDay, today)
    : null;

  const { primary, alternative } = buildSuggestions({
    workouts,
    routeGroups,
    acwr,
    recovery,
    todayWeekday: new Date().getDay(),
    maxHR,
    daysSinceLastWorkout,
  });

  // Wochenvolumen (Trainingsminuten), 8 Wochen bis zur aktuellen
  const currentWeekStart = weekStart(today);
  const weeklyMinutes: SeriesPoint[] = [];
  for (let i = 7; i >= 0; i--) {
    const start = addDays(currentWeekStart, -7 * i);
    const end = addDays(start, 6);
    let min = 0;
    for (const w of workouts) {
      if (w.day >= start && w.day <= end) min += w.durationMin;
    }
    weeklyMinutes.push({
      day: start,
      label: fmtDayMonth(start),
      full: `Woche ab ${fmtDateShort(start)}`,
      value: Math.round(min),
    });
  }

  return {
    refDay,
    staleDays,
    suggestion: primary,
    alternative,
    acwr,
    status: loadStatus(acwr),
    acute: round1(acute),
    chronic: round1(chronic),
    recovery,
    loadSeries,
    weeklyMinutes,
    currentWeekStart,
    maxHR,
  };
}

// ------------------------------------------------------------------ Helfer

async function metricRange(
  metric: MetricKey,
  from: string,
  to: string
): Promise<DailyMetric[]> {
  return db.dailyMetrics
    .where("[metric+day]")
    .between([metric, from], [metric, to], true, true)
    .toArray();
}

function avgOf(rows: DailyMetric[]): number | null {
  return rows.length
    ? rows.reduce((a, r) => a + r.value, 0) / rows.length
    : null;
}

function latestOf(rows: DailyMetric[]): number | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => (a.day < b.day ? -1 : 1))[rows.length - 1].value;
}

/** Montag der Woche eines Tagesschlüssels. */
export function weekStart(day: string): string {
  const dow = new Date(day + "T12:00:00").getDay(); // 0 = So
  return addDays(day, -((dow + 6) % 7));
}

function diffDays(from: string, to: string): number {
  return Math.round(
    (Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 86400000
  );
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export type { Suggestion, RecoveryResult, LoadStatus };
