import type {
  DailyMetric,
  ParsedHealthData,
  SleepNight,
  Workout,
  WorkoutRoute,
} from "@/modules/health-model/types";
import type { ImportSummary } from "@/modules/ingestion/types";
import { replaceAllData } from "@/modules/storage/db";
import { addDays, todayKey } from "@/modules/analytics/dates";
import { makeDemoRoute, type DemoRouteKind } from "./routes";

/**
 * Erzeugt 180 Tage plausible Demo-Daten (Läufer:in mit Rennrad im Raum
 * Braunschweig), damit die App ohne echten Health-Export ausprobiert werden
 * kann. Deterministisch geseedet, mit leichtem Fitness-Fortschritt über die
 * Zeit und wiederkehrenden GPS-Strecken (Pendelweg, Elm-Runde, Parkrunde) —
 * so haben Karte, Strecken-Vergleich und Trend-Badges etwas zu zeigen.
 */
export async function loadDemoData(): Promise<ImportSummary> {
  return replaceAllData(generateDemoData(), "demo");
}

export function generateDemoData(days = 180): ParsedHealthData {
  const rnd = mulberry32(42);
  const end = todayKey();
  const start = addDays(end, -(days - 1));

  const workouts: Workout[] = [];
  const dailyMetrics: DailyMetric[] = [];
  const sleepNights: SleepNight[] = [];
  const routes: WorkoutRoute[] = [];

  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    const p = i / days; // Trainingsfortschritt 0..1
    const dow = new Date(day + "T12:00:00").getDay(); // 0 = So

    // ------------------------------------------------------------ Workouts
    let workoutEnergy = 0;
    let workoutMin = 0;
    let runKm = 0;

    type Plan =
      | { kind: "run"; route: DemoRouteKind; laps?: number; halfKm?: number }
      | { kind: "ride"; route: DemoRouteKind; laps?: number }
      | { kind: "strength" };
    const schedule: Plan[] = [];

    if (dow === 2 || dow === 4)
      schedule.push({ kind: "run", route: "parkRun", laps: rnd() > 0.5 ? 3 : 2 });
    if (dow === 0 && rnd() > 0.25)
      schedule.push({ kind: "run", route: "riverRun", halfKm: 5 + rnd() * 2.5 });
    if (dow === 6 && rnd() > 0.2)
      schedule.push({ kind: "ride", route: "elm", laps: rnd() > 0.9 ? 2 : 1 });
    if ((dow === 1 || dow === 3) && rnd() > 0.4)
      schedule.push({ kind: "ride", route: "commute" });
    if (dow === 3 && rnd() > 0.5) schedule.push({ kind: "strength" });
    if (rnd() > 0.93) schedule.length = 0; // Ausfalltage

    for (const plan of schedule) {
      if (plan.kind === "strength") {
        const dur = 35 + rnd() * 20;
        const avgHr = Math.round(112 + (rnd() - 0.5) * 10);
        workouts.push(
          makeWorkout(day, "strength", "HKWorkoutActivityTypeFunctionalStrengthTraining", {
            startHour: 18,
            durationMin: dur,
            energyKcal: dur * 6.5,
            avgHeartRate: avgHr,
            maxHeartRate: avgHr + 25,
            rnd,
          })
        );
        workoutEnergy += dur * 6.5;
        workoutMin += dur;
        continue;
      }

      if (plan.kind === "run") {
        const isLong = plan.route === "riverRun";
        const startHour = isLong ? 9 : rnd() > 0.5 ? 7 : 18;
        const w = makeWorkout(day, "running", "HKWorkoutActivityTypeRunning", {
          startHour,
          durationMin: 1, // wird gleich aus Route + Pace gesetzt
          energyKcal: 0,
          avgHeartRate: 0,
          maxHeartRate: 0,
          rnd,
        });
        const route = makeDemoRoute(w.startDate, day, "running", plan.route, rnd, {
          laps: plan.laps,
          halfKm: plan.halfKm,
        });
        const dist = route.lengthKm;
        const pace = 6.15 - 0.85 * p + (rnd() - 0.5) * 0.5; // min/km, wird schneller
        const avgHr = Math.round(157 - 9 * p + (rnd() - 0.5) * 6);
        w.distanceKm = r2(dist);
        w.durationMin = r1(dist * pace);
        w.energyKcal = Math.round(dist * 68);
        w.avgHeartRate = avgHr;
        w.maxHeartRate = avgHr + 16 + Math.round(rnd() * 6);
        w.elevationM = Math.round(20 + rnd() * 90);
        w.endDate = shiftIso(w.startDate, w.durationMin);
        workouts.push(w);
        routes.push(route);
        workoutEnergy += dist * 68;
        workoutMin += w.durationMin;
        runKm += dist;
        continue;
      }

      // Radfahren: Elm-Runde (sportlich) oder Pendelweg zur Uni (gemütlich)
      const isCommute = plan.route === "commute";
      const w = makeWorkout(day, "cycling", "HKWorkoutActivityTypeCycling", {
        startHour: isCommute ? (rnd() > 0.5 ? 8 : 17) : 10,
        durationMin: 1,
        energyKcal: 0,
        avgHeartRate: 0,
        maxHeartRate: 0,
        rnd,
      });
      const route = makeDemoRoute(w.startDate, day, "cycling", plan.route, rnd, {
        laps: plan.laps,
      });
      const dist = route.lengthKm;
      const speed = isCommute
        ? 17.5 + rnd() * 2.5
        : 21.5 + 4.5 * p + (rnd() - 0.5) * 2;
      const avgHr = isCommute
        ? Math.round(116 + (rnd() - 0.5) * 8)
        : Math.round(142 - 7 * p + (rnd() - 0.5) * 6);
      w.distanceKm = r2(dist);
      w.durationMin = r1((dist / speed) * 60);
      w.energyKcal = Math.round(dist * (isCommute ? 18 : 26));
      w.avgHeartRate = avgHr;
      w.maxHeartRate = avgHr + (isCommute ? 18 : 22 + Math.round(rnd() * 8));
      w.elevationM = Math.round(isCommute ? 25 + rnd() * 20 : 150 + rnd() * 450);
      w.endDate = shiftIso(w.startDate, w.durationMin);
      workouts.push(w);
      routes.push(route);
      workoutEnergy += w.energyKcal;
      workoutMin += w.durationMin;
    }

    // ------------------------------------------------------- Tagesmetriken
    const baseSteps = 6200 + rnd() * 4200 + runKm * 1150;
    const steps = Math.round(dow === 0 || dow === 6 ? baseSteps * 0.92 : baseSteps);
    const activeEnergy = Math.round(300 + rnd() * 220 + workoutEnergy * 0.95);
    const exerciseMin = Math.round(14 + rnd() * 22 + workoutMin * 0.9);

    push(dailyMetrics, day, "steps", steps);
    push(dailyMetrics, day, "activeEnergy", activeEnergy);
    push(dailyMetrics, day, "exerciseMin", exerciseMin);
    push(dailyMetrics, day, "standHours", Math.round(9 + rnd() * 4));
    push(dailyMetrics, day, "distanceWalkRun", r2(steps * 0.00072 + runKm));

    const restingHR = r1(61.5 - 6 * p + (rnd() - 0.5) * 2.4);
    push(dailyMetrics, day, "restingHR", restingHR);
    push(dailyMetrics, day, "hrv", r1(36 + 12 * p + (rnd() - 0.5) * 9));

    const dayMax =
      workouts.length && workouts[workouts.length - 1].day === day
        ? (workouts[workouts.length - 1].maxHeartRate ?? 150)
        : Math.round(118 + rnd() * 25);
    dailyMetrics.push({
      day,
      metric: "heartRate",
      value: r1(68 + (rnd() - 0.5) * 8),
      min: Math.round(restingHR - 8 - rnd() * 4),
      max: dayMax,
    });

    // --------------------------------------------------------------- Schlaf
    if (rnd() > 0.05) {
      const asleep = 385 + rnd() * 105 + (workoutMin > 60 ? 15 : 0);
      const deep = asleep * (0.13 + rnd() * 0.06);
      const rem = asleep * (0.19 + rnd() * 0.07);
      const awake = 12 + rnd() * 28;
      const core = asleep - deep - rem;
      sleepNights.push({
        day,
        inBedMin: Math.round(asleep + awake + 8 + rnd() * 15),
        asleepMin: Math.round(asleep),
        deepMin: Math.round(deep),
        coreMin: Math.round(core),
        remMin: Math.round(rem),
        awakeMin: Math.round(awake),
        start: `${addDays(day, -1)}T${23 - (rnd() > 0.6 ? 1 : 0)}:${pad2(Math.floor(rnd() * 60))}:00`,
        end: `${day}T0${6 + Math.floor(rnd() * 2)}:${pad2(Math.floor(rnd() * 60))}:00`,
      });
    }
  }

  return { workouts, dailyMetrics, sleepNights, routes };
}

// ------------------------------------------------------------------ Helfer

function makeWorkout(
  day: string,
  type: Workout["type"],
  rawType: string,
  o: {
    startHour: number;
    durationMin: number;
    distanceKm?: number;
    energyKcal: number;
    avgHeartRate: number;
    maxHeartRate: number;
    elevationM?: number;
    rnd: () => number;
  }
): Workout {
  const startMin = Math.floor(o.rnd() * 50);
  const start = `${day}T${pad2(o.startHour)}:${pad2(startMin)}:00`;
  return {
    type,
    rawType,
    startDate: start,
    endDate: shiftIso(start, o.durationMin),
    day,
    durationMin: r1(o.durationMin),
    distanceKm: o.distanceKm !== undefined ? r2(o.distanceKm) : undefined,
    energyKcal: Math.round(o.energyKcal),
    avgHeartRate: o.avgHeartRate,
    maxHeartRate: o.maxHeartRate,
    elevationM: o.elevationM,
    sourceName: "Apple Watch (Demo)",
  };
}

/** ISO-Zeitpunkt um n Minuten verschieben (lokale Demo-Zeit ohne Offset). */
function shiftIso(startIso: string, minutes: number): string {
  const d = new Date(new Date(startIso).getTime() + minutes * 60000);
  return `${startIso.slice(0, 10)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function push(
  arr: DailyMetric[],
  day: string,
  metric: DailyMetric["metric"],
  value: number
): void {
  arr.push({ day, metric, value });
}

/** Deterministischer PRNG, damit die Demo bei jedem Laden gleich aussieht. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function r1(v: number): number {
  return Math.round(v * 10) / 10;
}
function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
