/**
 * Ingestion-Modul: Jede Datenquelle liefert am Ende ein ParsedHealthData.
 * Aktuell implementiert: Apple-Health-Export (ZIP/XML-Upload) und Demo-Daten.
 * Vorgesehen für später: iOS-Kurzbefehl-Webhook, native Begleit-App.
 */

export type SourceId = "apple-health-export" | "demo";

export interface ImportProgress {
  phase: "reading" | "storing" | "done";
  /** 0–100 */
  percent: number;
  records: number;
  workouts: number;
  /** gefundene GPS-Routen (GPX-Dateien) */
  routes: number;
  /** bereits verarbeitete (entpackte) XML-Bytes */
  bytesRead: number;
}

export interface ImportSummary {
  source: SourceId;
  workouts: number;
  metricDays: number;
  sleepNights: number;
  routes: number;
  rangeStart?: string;
  rangeEnd?: string;
}
