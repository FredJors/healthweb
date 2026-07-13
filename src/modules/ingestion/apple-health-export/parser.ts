import type {
  DailyMetric,
  MetricKey,
  ParsedHealthData,
  SleepNight,
  Workout,
  WorkoutType,
} from "@/modules/health-model/types";

/**
 * Inkrementeller Parser für Apples export.xml.
 *
 * Die Datei kann mehrere hundert MB groß sein und Millionen von Records
 * enthalten — ein DOM-Parser scheidet daher aus. Stattdessen wird der Text
 * in Chunks durchsucht; interessante Elemente (<Record>, <Workout>,
 * <ActivitySummary>) werden direkt zu Tagesaggregaten bzw. Workout-Objekten
 * verdichtet, alles andere wird übersprungen. Rohdaten (z. B. einzelne
 * Herzfrequenz-Samples) landen nie im Speicher.
 */

type SumPerSource = Map<string, Map<string, number>>; // day -> source -> sum
type AvgAcc = Map<string, { sum: number; count: number }>; // day -> acc

interface HrAcc {
  sum: number;
  count: number;
  min: number;
  max: number;
}

interface SleepAcc {
  inBed: number;
  awake: number;
  core: number;
  deep: number;
  rem: number;
  unspec: number;
  start?: string;
  end?: string;
}

/** Metriken, die pro Quelle summiert und dann per max(Quelle) dedupliziert werden
 * (iPhone und Watch zählen Schritte doppelt — Apple blendet das intern aus,
 * im Export stehen beide). */
const SUM_METRICS: Record<string, { metric: MetricKey; kind: "distance" | "energy" | "time" | "count" }> = {
  HKQuantityTypeIdentifierStepCount: { metric: "steps", kind: "count" },
  HKQuantityTypeIdentifierActiveEnergyBurned: { metric: "activeEnergy", kind: "energy" },
  HKQuantityTypeIdentifierAppleExerciseTime: { metric: "exerciseMin", kind: "time" },
  HKQuantityTypeIdentifierDistanceWalkingRunning: { metric: "distanceWalkRun", kind: "distance" },
  HKQuantityTypeIdentifierDistanceCycling: { metric: "distanceCycling", kind: "distance" },
};

/** Metriken, die pro Tag gemittelt werden. */
const AVG_METRICS: Record<string, MetricKey> = {
  HKQuantityTypeIdentifierRestingHeartRate: "restingHR",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv",
  HKQuantityTypeIdentifierVO2Max: "vo2max",
};

const WORKOUT_TYPE_MAP: Record<string, WorkoutType> = {
  Running: "running",
  Cycling: "cycling",
  Walking: "walking",
  Hiking: "hiking",
  Swimming: "swimming",
  FunctionalStrengthTraining: "strength",
  TraditionalStrengthTraining: "strength",
  CoreTraining: "strength",
  HighIntensityIntervalTraining: "hiit",
  Yoga: "yoga",
  Rowing: "rowing",
};

const STATS_RE = /<WorkoutStatistics\s([^>]*?)\/>/g;
const META_RE = /<MetadataEntry\s([^>]*?)\/>/g;

export class AppleHealthExportParser {
  records = 0;
  workoutCount = 0;

  private buf = "";
  private sums = new Map<MetricKey, SumPerSource>();
  private avgs = new Map<MetricKey, AvgAcc>();
  private hr = new Map<string, HrAcc>(); // day -> acc
  private sleep = new Map<string, Map<string, SleepAcc>>(); // night -> source -> acc
  private summaries = new Map<
    string,
    { activeEnergy?: number; exerciseMin?: number; standHours?: number }
  >();
  private workouts: Workout[] = [];

  /** Nimmt dekodierte Text-Chunks entgegen (TextDecoder mit stream:true). */
  write(text: string): void {
    if (!text) return;
    this.buf += text;
    this.process();
  }

  finish(): ParsedHealthData {
    this.process();
    return {
      workouts: dedupWorkouts(this.workouts),
      dailyMetrics: this.buildDailyMetrics(),
      sleepNights: this.buildSleepNights(),
      // GPS-Routen kommen aus den GPX-Dateien der ZIP, nicht aus der XML —
      // der Import-Orchestrator füllt sie nach dem Workout-Abgleich.
      routes: [],
    };
  }

  // ---------------------------------------------------------------- Scanner

  private process(): void {
    const buf = this.buf;
    const n = buf.length;
    let pos = 0;
    // Fundstellen je Zieltyp cachen (-1 = im restlichen Puffer nicht vorhanden,
    // -2 = noch nicht gesucht). Millionen Records stehen VOR dem ersten
    // <Workout>; ohne Cache durchsucht jede Record-Iteration den kompletten
    // Restpuffer erfolglos nach <Workout>/<ActivitySummary> — quadratische
    // Laufzeit, die große Importe einfrieren ließ.
    let iR = -2;
    let iW = -2;
    let iA = -2;

    while (pos < n) {
      if (iR !== -1 && iR < pos) iR = buf.indexOf("<Record ", pos);
      if (iW !== -1 && iW < pos) iW = buf.indexOf("<Workout ", pos);
      if (iA !== -1 && iA < pos) iA = buf.indexOf("<ActivitySummary ", pos);

      let start = -1;
      let kind: "r" | "w" | "a" = "r";
      if (iR !== -1) {
        start = iR;
        kind = "r";
      }
      if (iW !== -1 && (start === -1 || iW < start)) {
        start = iW;
        kind = "w";
      }
      if (iA !== -1 && (start === -1 || iA < start)) {
        start = iA;
        kind = "a";
      }
      if (start === -1) {
        pos = n;
        break;
      }

      const tagEnd = buf.indexOf(">", start);
      if (tagEnd === -1) {
        pos = start; // Öffnender Tag noch unvollständig -> auf nächsten Chunk warten
        break;
      }
      const selfClosing = buf.charCodeAt(tagEnd - 1) === 47; /* '/' */
      const openTag = buf.slice(start, tagEnd + 1);

      if (kind === "w") {
        if (selfClosing) {
          this.handleWorkout(openTag, "");
          pos = tagEnd + 1;
        } else {
          const close = buf.indexOf("</Workout>", tagEnd);
          if (close === -1) {
            pos = start;
            break;
          }
          this.handleWorkout(openTag, buf.slice(tagEnd + 1, close));
          pos = close + "</Workout>".length;
        }
      } else if (kind === "r") {
        if (selfClosing) {
          this.handleRecord(openTag);
          pos = tagEnd + 1;
        } else {
          // Records mit Metadaten-Kindern: Attribute stehen im öffnenden Tag
          const close = buf.indexOf("</Record>", tagEnd);
          if (close === -1) {
            pos = start;
            break;
          }
          this.handleRecord(openTag);
          pos = close + "</Record>".length;
        }
      } else {
        this.handleActivitySummary(openTag);
        pos = tagEnd + 1;
      }
    }

    if (pos >= n) {
      // Kein unvollständiges Element — nur einen Mini-Schwanz behalten,
      // falls ein Tag genau an der Chunk-Grenze zerschnitten wurde.
      const guard = Math.max(0, n - 32);
      const lt = buf.lastIndexOf("<");
      this.buf = lt >= guard ? buf.slice(lt) : "";
    } else {
      this.buf = buf.slice(pos);
    }
  }

  // --------------------------------------------------------------- Handler

  private handleRecord(tag: string): void {
    this.records++;
    const type = attr(tag, "type");
    if (!type) return;

    const sum = SUM_METRICS[type];
    if (sum) {
      const day = attr(tag, "startDate")?.slice(0, 10);
      const raw = num(attr(tag, "value"));
      if (!day || raw === undefined) return;
      const value = convert(raw, attr(tag, "unit"), sum.kind);
      const source = attr(tag, "sourceName") ?? "?";
      let perDay = this.sums.get(sum.metric);
      if (!perDay) this.sums.set(sum.metric, (perDay = new Map()));
      let perSource = perDay.get(day);
      if (!perSource) perDay.set(day, (perSource = new Map()));
      perSource.set(source, (perSource.get(source) ?? 0) + value);
      return;
    }

    const avgKey = AVG_METRICS[type];
    if (avgKey) {
      const day = attr(tag, "startDate")?.slice(0, 10);
      const value = num(attr(tag, "value"));
      if (!day || value === undefined) return;
      let acc = this.avgs.get(avgKey);
      if (!acc) this.avgs.set(avgKey, (acc = new Map()));
      const a = acc.get(day);
      if (a) {
        a.sum += value;
        a.count++;
      } else {
        acc.set(day, { sum: value, count: 1 });
      }
      return;
    }

    if (type === "HKQuantityTypeIdentifierHeartRate") {
      const day = attr(tag, "startDate")?.slice(0, 10);
      const value = num(attr(tag, "value"));
      if (!day || value === undefined || value <= 0) return;
      const a = this.hr.get(day);
      if (a) {
        a.sum += value;
        a.count++;
        if (value < a.min) a.min = value;
        if (value > a.max) a.max = value;
      } else {
        this.hr.set(day, { sum: value, count: 1, min: value, max: value });
      }
      return;
    }

    if (type === "HKCategoryTypeIdentifierSleepAnalysis") {
      this.handleSleep(tag);
    }
  }

  private handleSleep(tag: string): void {
    const startStr = attr(tag, "startDate");
    const endStr = attr(tag, "endDate");
    const value = attr(tag, "value");
    if (!startStr || !endStr || !value) return;

    const minutes =
      (Date.parse(toIso(endStr)) - Date.parse(toIso(startStr))) / 60000;
    if (!isFinite(minutes) || minutes <= 0 || minutes > 18 * 60) return;

    // Nacht = Kalendertag des Aufwachens. Segmente, die abends vor
    // Mitternacht enden, gehören zur Nacht des Folgetags.
    const endDay = endStr.slice(0, 10);
    const endHour = parseInt(endStr.slice(11, 13), 10);
    const night = endHour >= 18 ? addDaysToKey(endDay, 1) : endDay;

    const source = attr(tag, "sourceName") ?? "?";
    let perSource = this.sleep.get(night);
    if (!perSource) this.sleep.set(night, (perSource = new Map()));
    let acc = perSource.get(source);
    if (!acc) {
      perSource.set(
        source,
        (acc = { inBed: 0, awake: 0, core: 0, deep: 0, rem: 0, unspec: 0 })
      );
    }

    if (value.endsWith("InBed")) acc.inBed += minutes;
    else if (value.endsWith("Awake")) acc.awake += minutes;
    else if (value.endsWith("AsleepCore")) acc.core += minutes;
    else if (value.endsWith("AsleepDeep")) acc.deep += minutes;
    else if (value.endsWith("AsleepREM")) acc.rem += minutes;
    else if (value.includes("Asleep")) acc.unspec += minutes;
    else return;

    const startIso = toIso(startStr);
    const endIso = toIso(endStr);
    if (!acc.start || startIso < acc.start) acc.start = startIso;
    if (!acc.end || endIso > acc.end) acc.end = endIso;
  }

  private handleWorkout(openTag: string, children: string): void {
    const rawType = attr(openTag, "workoutActivityType") ?? "";
    const startStr = attr(openTag, "startDate");
    const endStr = attr(openTag, "endDate");
    if (!startStr || !endStr) return;

    let durationMin = convert(
      num(attr(openTag, "duration")) ?? NaN,
      attr(openTag, "durationUnit") ?? "min",
      "time"
    );
    if (!isFinite(durationMin) || durationMin <= 0) {
      durationMin =
        (Date.parse(toIso(endStr)) - Date.parse(toIso(startStr))) / 60000;
    }
    if (!isFinite(durationMin) || durationMin < 1) return;

    // Ältere Exporte: Distanz/Energie als Attribute am Workout selbst
    let distanceKm = maybeConvert(
      num(attr(openTag, "totalDistance")),
      attr(openTag, "totalDistanceUnit"),
      "distance"
    );
    let energyKcal = maybeConvert(
      num(attr(openTag, "totalEnergyBurned")),
      attr(openTag, "totalEnergyBurnedUnit"),
      "energy"
    );
    let avgHeartRate: number | undefined;
    let maxHeartRate: number | undefined;
    let elevationM: number | undefined;

    // Neuere Exporte: WorkoutStatistics-Kinder
    if (children) {
      STATS_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = STATS_RE.exec(children))) {
        const s = m[1];
        const sType = attr(s, "type") ?? "";
        if (sType.includes("Distance")) {
          const v = maybeConvert(num(attr(s, "sum")), attr(s, "unit"), "distance");
          if (v !== undefined) distanceKm = (distanceKm ?? 0) + v;
        } else if (sType.endsWith("ActiveEnergyBurned")) {
          const v = maybeConvert(num(attr(s, "sum")), attr(s, "unit"), "energy");
          if (v !== undefined) energyKcal = v;
        } else if (sType.endsWith("HeartRate")) {
          avgHeartRate = num(attr(s, "average")) ?? avgHeartRate;
          maxHeartRate = num(attr(s, "maximum")) ?? maxHeartRate;
        }
      }
      META_RE.lastIndex = 0;
      while ((m = META_RE.exec(children))) {
        if (attr(m[1], "key") === "HKElevationAscended") {
          const v = attr(m[1], "value"); // z. B. "12345 cm"
          const parts = v?.split(" ");
          const val = num(parts?.[0]);
          if (val !== undefined) {
            elevationM =
              parts?.[1] === "cm" ? val / 100 : parts?.[1] === "km" ? val * 1000 : val;
          }
        }
      }
    }

    const shortType = rawType.replace("HKWorkoutActivityType", "");
    this.workouts.push({
      type: WORKOUT_TYPE_MAP[shortType] ?? "other",
      rawType,
      startDate: toIso(startStr),
      endDate: toIso(endStr),
      day: startStr.slice(0, 10),
      durationMin: round1(durationMin),
      distanceKm: distanceKm !== undefined ? round2(distanceKm) : undefined,
      energyKcal: energyKcal !== undefined ? Math.round(energyKcal) : undefined,
      avgHeartRate: avgHeartRate !== undefined ? Math.round(avgHeartRate) : undefined,
      maxHeartRate: maxHeartRate !== undefined ? Math.round(maxHeartRate) : undefined,
      elevationM: elevationM !== undefined ? Math.round(elevationM) : undefined,
      sourceName: decodeEntities(attr(openTag, "sourceName") ?? ""),
    });
    this.workoutCount++;
  }

  private handleActivitySummary(tag: string): void {
    const day = attr(tag, "dateComponents");
    if (!day || day.length !== 10) return;
    const energy = num(attr(tag, "activeEnergyBurned"));
    const exercise = num(attr(tag, "appleExerciseTime"));
    const stand = num(attr(tag, "appleStandHours"));
    const entry: { activeEnergy?: number; exerciseMin?: number; standHours?: number } = {};
    if (energy !== undefined && energy > 0) entry.activeEnergy = energy;
    if (exercise !== undefined && exercise > 0) entry.exerciseMin = exercise;
    if (stand !== undefined && stand > 0) entry.standHours = stand;
    if (Object.keys(entry).length) this.summaries.set(day, entry);
  }

  // ------------------------------------------------------------ Verdichten

  private buildDailyMetrics(): DailyMetric[] {
    const out: DailyMetric[] = [];

    // Summen-Metriken: pro Tag die Quelle mit dem größten Wert
    // (iPhone vs. Watch zählen parallel — max ist die übliche Heuristik)
    for (const [metric, perDay] of this.sums) {
      for (const [day, perSource] of perDay) {
        let best = 0;
        for (const v of perSource.values()) if (v > best) best = v;
        if (best > 0) out.push({ day, metric, value: round2(best) });
      }
    }

    for (const [metric, perDay] of this.avgs) {
      for (const [day, a] of perDay) {
        out.push({ day, metric, value: round1(a.sum / a.count) });
      }
    }

    for (const [day, a] of this.hr) {
      out.push({
        day,
        metric: "heartRate",
        value: round1(a.sum / a.count),
        min: Math.round(a.min),
        max: Math.round(a.max),
      });
    }

    // ActivitySummaries (die "Ringe") sind die verlässlichste Quelle für
    // Energie/Trainingszeit — sie überschreiben record-basierte Aggregation.
    const byKey = new Map(out.map((m) => [`${m.metric}|${m.day}`, m]));
    for (const [day, s] of this.summaries) {
      const apply = (metric: MetricKey, value: number | undefined) => {
        if (value === undefined) return;
        const key = `${metric}|${day}`;
        const existing = byKey.get(key);
        if (existing) existing.value = round1(value);
        else {
          const m: DailyMetric = { day, metric, value: round1(value) };
          byKey.set(key, m);
          out.push(m);
        }
      };
      apply("activeEnergy", s.activeEnergy);
      apply("exerciseMin", s.exerciseMin);
      apply("standHours", s.standHours);
    }

    return out;
  }

  private buildSleepNights(): SleepNight[] {
    const out: SleepNight[] = [];
    for (const [night, perSource] of this.sleep) {
      // Beste Quelle pro Nacht: die mit den meisten Schlafminuten
      // (Watch liefert Phasen, iPhone meist nur "InBed")
      let best: SleepAcc | undefined;
      let bestScore = -1;
      for (const acc of perSource.values()) {
        const asleep = acc.core + acc.deep + acc.rem + acc.unspec;
        const score = asleep + (acc.deep + acc.rem > 0 ? 100000 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = acc;
        }
      }
      if (!best) continue;
      const asleepMin = best.core + best.deep + best.rem + best.unspec;
      if (asleepMin < 30 && best.inBed < 30) continue;
      out.push({
        day: night,
        inBedMin: Math.round(Math.max(best.inBed, asleepMin + best.awake)),
        asleepMin: Math.round(asleepMin),
        deepMin: Math.round(best.deep),
        coreMin: Math.round(best.core + best.unspec),
        remMin: Math.round(best.rem),
        awakeMin: Math.round(best.awake),
        start: best.start,
        end: best.end,
      });
    }
    return out;
  }
}

// ------------------------------------------------------------------ Helfer

/** Dasselbe Workout kann doppelt im Export stehen (z. B. von iPhone UND
 * Watch protokolliert) — bei identischem Start und Typ gewinnt der Eintrag
 * mit den vollständigeren Daten. */
function dedupWorkouts(workouts: Workout[]): Workout[] {
  const byKey = new Map<string, Workout>();
  for (const w of workouts) {
    const key = `${w.startDate}|${w.rawType}`;
    const existing = byKey.get(key);
    if (!existing || richness(w) > richness(existing)) byKey.set(key, w);
  }
  return [...byKey.values()];
}

function richness(w: Workout): number {
  return (
    (w.distanceKm !== undefined ? 2 : 0) +
    (w.avgHeartRate !== undefined ? 2 : 0) +
    (w.energyKcal !== undefined ? 1 : 0) +
    (w.maxHeartRate !== undefined ? 1 : 0) +
    (w.elevationM !== undefined ? 1 : 0) +
    Math.min(w.durationMin / 1e6, 0.5) // Tiebreak: längere Aufzeichnung
  );
}

/** Attributwert aus einem Tag-String extrahieren (ohne vollständigen XML-Parser). */
function attr(tag: string, name: string): string | undefined {
  const needle = `${name}="`;
  const i = tag.indexOf(needle);
  if (i === -1) return undefined;
  const start = i + needle.length;
  const end = tag.indexOf('"', start);
  if (end === -1) return undefined;
  return tag.slice(start, end);
}

function num(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const v = parseFloat(s);
  return isFinite(v) ? v : undefined;
}

/** "2024-01-01 08:00:00 +0100" -> "2024-01-01T08:00:00+0100" */
function toIso(s: string): string {
  return s.replace(" ", "T").replace(" ", "");
}

export function addDaysToKey(day: string, delta: number): string {
  const d = new Date(
    Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))
  );
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function convert(
  value: number,
  unit: string | undefined,
  kind: "distance" | "energy" | "time" | "count"
): number {
  switch (kind) {
    case "distance":
      if (unit === "km") return value;
      if (unit === "mi") return value * 1.60934;
      if (unit === "m") return value / 1000;
      if (unit === "yd") return value * 0.0009144;
      if (unit === "ft") return value * 0.0003048;
      return value;
    case "energy":
      if (unit === "kcal" || unit === "Cal") return value;
      if (unit === "kJ") return value / 4.184;
      if (unit === "cal") return value / 1000;
      return value;
    case "time":
      if (unit === "min") return value;
      if (unit === "s" || unit === "sec") return value / 60;
      if (unit === "hr" || unit === "h") return value * 60;
      return value;
    default:
      return value;
  }
}

function maybeConvert(
  value: number | undefined,
  unit: string | undefined,
  kind: "distance" | "energy" | "time" | "count"
): number | undefined {
  if (value === undefined || value <= 0) return undefined;
  return convert(value, unit, kind);
}

function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
