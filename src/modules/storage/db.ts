import Dexie, { type Table } from "dexie";
import type {
  DailyMetric,
  ParsedHealthData,
  SleepNight,
  Workout,
  WorkoutRoute,
} from "@/modules/health-model/types";
import type { ImportSummary, SourceId } from "@/modules/ingestion/types";
import type { Meal, MealSlot } from "@/modules/nutrition/types";

export interface ImportMeta {
  id?: number;
  importedAt: string;
  source: SourceId;
  workouts: number;
  metricDays: number;
  sleepNights: number;
  routes?: number;
  rangeStart?: string;
  rangeEnd?: string;
}

class HealthDB extends Dexie {
  workouts!: Table<Workout, number>;
  dailyMetrics!: Table<DailyMetric, [string, string]>;
  sleepNights!: Table<SleepNight, string>;
  imports!: Table<ImportMeta, number>;
  routes!: Table<WorkoutRoute, number>;
  meals!: Table<Meal, [string, MealSlot]>;

  constructor() {
    super("healthweb");
    this.version(1).stores({
      workouts: "++id, day, type, startDate",
      dailyMetrics: "[metric+day], day, metric",
      sleepNights: "day",
      imports: "++id, importedAt",
    });
    // v2: GPS-Routen aus den workout-routes/*.gpx des Exports
    this.version(2).stores({
      routes: "++id, workoutStart, day, type",
    });
    // v3: Mahlzeiten (Ernährung) — ein Eintrag je Tag+Slot
    this.version(3).stores({
      meals: "[day+slot], day",
    });
  }
}

export const db = new HealthDB();

/**
 * Ein Apple-Health-Export enthält immer die komplette Historie,
 * deshalb ersetzt jeder Import den gesamten Datenbestand (idempotent).
 */
export async function replaceAllData(
  data: ParsedHealthData,
  source: SourceId
): Promise<ImportSummary> {
  const days = new Set(data.dailyMetrics.map((m) => m.day));
  for (const w of data.workouts) days.add(w.day);
  const sorted = [...days].sort();

  const meta: ImportMeta = {
    importedAt: new Date().toISOString(),
    source,
    workouts: data.workouts.length,
    metricDays: days.size,
    sleepNights: data.sleepNights.length,
    routes: data.routes.length,
    rangeStart: sorted[0],
    rangeEnd: sorted[sorted.length - 1],
  };

  await db.transaction(
    "rw",
    [db.workouts, db.dailyMetrics, db.sleepNights, db.imports, db.routes],
    async () => {
      await Promise.all([
        db.workouts.clear(),
        db.dailyMetrics.clear(),
        db.sleepNights.clear(),
        db.imports.clear(),
        db.routes.clear(),
      ]);
      await db.workouts.bulkAdd(data.workouts);
      await db.dailyMetrics.bulkPut(data.dailyMetrics);
      await db.sleepNights.bulkPut(data.sleepNights);
      await db.routes.bulkAdd(data.routes);
      await db.imports.add(meta);
    }
  );

  return {
    source,
    workouts: meta.workouts,
    metricDays: meta.metricDays,
    sleepNights: meta.sleepNights,
    routes: data.routes.length,
    rangeStart: meta.rangeStart,
    rangeEnd: meta.rangeEnd,
  };
}

/**
 * Löscht ALLE lokalen Daten — auch die selbst erfassten Mahlzeiten.
 * (Ein Import ersetzt dagegen nur die Export-Daten; Mahlzeiten bleiben.)
 */
export async function clearAllData(): Promise<void> {
  await db.transaction(
    "rw",
    [db.workouts, db.dailyMetrics, db.sleepNights, db.imports, db.routes, db.meals],
    async () => {
      await Promise.all([
        db.workouts.clear(),
        db.dailyMetrics.clear(),
        db.sleepNights.clear(),
        db.imports.clear(),
        db.routes.clear(),
        db.meals.clear(),
      ]);
    }
  );
}

export async function getLatestImport(): Promise<ImportMeta | undefined> {
  return db.imports.orderBy("importedAt").last();
}
