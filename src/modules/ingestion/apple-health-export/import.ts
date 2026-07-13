import { replaceAllData } from "@/modules/storage/db";
import type { Workout, WorkoutRoute } from "@/modules/health-model/types";
import type { ImportProgress, ImportSummary } from "@/modules/ingestion/types";
import { AppleHealthExportParser } from "./parser";
import { parseGpx, type ParsedGpx } from "./gpx";
import { streamHealthExport } from "./zip-stream";

/**
 * Kompletter Import-Lauf: Datei streamen -> parsen (XML + GPX-Routen) ->
 * verdichten -> Routen den Workouts zuordnen -> speichern.
 * Läuft vollständig im Browser; nichts verlässt das Gerät.
 */
export async function importAppleHealthExport(
  file: File,
  onProgress?: (p: ImportProgress) => void
): Promise<ImportSummary> {
  const parser = new AppleHealthExportParser();
  const decoder = new TextDecoder();
  const gpxDecoder = new TextDecoder();
  const gpxFiles: ParsedGpx[] = [];

  let xmlBytes = 0;
  let fraction = 0;
  let lastReport = 0;

  const report = (phase: ImportProgress["phase"], force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < 150) return;
    lastReport = now;
    onProgress?.({
      phase,
      percent:
        phase === "reading" ? Math.round(fraction * 92) : phase === "storing" ? 96 : 100,
      records: parser.records,
      workouts: parser.workoutCount,
      routes: gpxFiles.length,
      bytesRead: xmlBytes,
    });
  };

  await streamHealthExport(file, {
    onXmlChunk: (bytes) => {
      xmlBytes += bytes.byteLength;
      parser.write(decoder.decode(bytes, { stream: true }));
      report("reading");
    },
    onGpxFile: (_name, bytes) => {
      const gpx = parseGpx(gpxDecoder.decode(bytes));
      if (gpx && gpx.points.length > 1 && gpx.startTime) gpxFiles.push(gpx);
      report("reading");
    },
    onProgress: (f) => {
      fraction = f;
      report("reading");
    },
  });
  parser.write(decoder.decode());
  report("reading", true);

  const data = parser.finish();
  if (
    data.workouts.length === 0 &&
    data.dailyMetrics.length === 0 &&
    data.sleepNights.length === 0
  ) {
    throw new Error(
      "Die Datei enthält keine erkennbaren Health-Daten. Bitte den unveränderten Export (ZIP oder export.xml) aus der Health-App verwenden."
    );
  }
  data.routes = matchRoutesToWorkouts(gpxFiles, data.workouts);

  report("storing", true);
  const summary = await replaceAllData(data, "apple-health-export");
  report("done", true);

  return summary;
}

/**
 * Ordnet jede GPX-Route dem Workout zu, in dessen Zeitfenster ihr erster
 * Trackpunkt fällt (±10 min Toleranz — die Route startet oft ein paar
 * Sekunden vor/nach dem Workout).
 */
function matchRoutesToWorkouts(
  gpxFiles: ParsedGpx[],
  workouts: Workout[]
): WorkoutRoute[] {
  const TOLERANCE_MS = 10 * 60 * 1000;
  const sorted = workouts
    .map((w) => ({
      w,
      start: Date.parse(w.startDate),
      end: Date.parse(w.endDate),
    }))
    .filter((x) => isFinite(x.start) && isFinite(x.end))
    .sort((a, b) => a.start - b.start);

  const routes: WorkoutRoute[] = [];
  for (const gpx of gpxFiles) {
    const t = Date.parse(gpx.startTime!);
    if (!isFinite(t)) continue;

    let best: (typeof sorted)[number] | null = null;
    let bestDist = Infinity;
    for (const cand of sorted) {
      if (t < cand.start - TOLERANCE_MS) break; // sortiert -> nichts mehr möglich
      if (t > cand.end + TOLERANCE_MS) continue;
      const d = Math.abs(t - cand.start);
      if (d < bestDist) {
        bestDist = d;
        best = cand;
      }
    }
    if (!best) continue;

    routes.push({
      workoutStart: best.w.startDate,
      day: best.w.day,
      type: best.w.type,
      points: gpx.points,
      lengthKm: gpx.lengthKm,
    });
  }
  return routes;
}
