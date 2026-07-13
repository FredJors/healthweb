/**
 * Domänenmodell — bewusst unabhängig von der Datenquelle (Apple-Health-Export,
 * später Kurzbefehl-Webhook oder Begleit-App) und vom Speicher-Backend.
 * Alle Werte in kanonischen Einheiten: km, kcal, Minuten, Schläge/min, ms.
 */

export type WorkoutType =
  | "running"
  | "cycling"
  | "walking"
  | "hiking"
  | "swimming"
  | "strength"
  | "hiit"
  | "yoga"
  | "rowing"
  | "other";

export interface Workout {
  id?: number;
  type: WorkoutType;
  /** Original-HealthKit-Typ, z. B. HKWorkoutActivityTypeRunning */
  rawType: string;
  /** ISO-8601 mit Zeitzonen-Offset der Aufzeichnung */
  startDate: string;
  endDate: string;
  /** Lokaler Kalendertag der Aufzeichnung, YYYY-MM-DD */
  day: string;
  durationMin: number;
  distanceKm?: number;
  energyKcal?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  elevationM?: number;
  sourceName?: string;
}

export type MetricKey =
  | "steps"
  | "activeEnergy"
  | "exerciseMin"
  | "standHours"
  | "distanceWalkRun"
  | "distanceCycling"
  | "restingHR"
  | "hrv"
  | "vo2max"
  | "heartRate";

export interface DailyMetric {
  /** YYYY-MM-DD */
  day: string;
  metric: MetricKey;
  value: number;
  /** nur für heartRate gefüllt */
  min?: number;
  max?: number;
}

export interface SleepNight {
  /** Kalendertag des Aufwachens, YYYY-MM-DD */
  day: string;
  inBedMin: number;
  asleepMin: number;
  deepMin: number;
  coreMin: number;
  remMin: number;
  awakeMin: number;
  start?: string;
  end?: string;
}

/** GPS-Route eines Workouts (vereinfachte Punktfolge). */
export interface WorkoutRoute {
  id?: number;
  /** startDate (ISO) des zugehörigen Workouts — Join-Schlüssel */
  workoutStart: string;
  day: string;
  type: WorkoutType;
  /** [lat, lon] — auf ~15 m ausgedünnt, max. ~600 Punkte */
  points: Array<[number, number]>;
  /** Streckenlänge laut GPS in km */
  lengthKm: number;
}

/** Ergebnis eines Parse-Laufs einer beliebigen Datenquelle. */
export interface ParsedHealthData {
  workouts: Workout[];
  dailyMetrics: DailyMetric[];
  sleepNights: SleepNight[];
  routes: WorkoutRoute[];
}
