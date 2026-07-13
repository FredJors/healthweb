/**
 * Leichter GPX-Parser für die workout-routes/*.gpx des Apple-Health-Exports.
 * Extrahiert Startzeit + Punktfolge und dünnt die Route direkt aus
 * (~15-m-Schritte, max. ~600 Punkte), damit IndexedDB und Karte schlank bleiben.
 */

export interface ParsedGpx {
  /** Zeitstempel des ersten Trackpunkts (ISO, meist UTC) */
  startTime?: string;
  /** [lat, lon] vereinfacht */
  points: Array<[number, number]>;
  /** Länge der Original-Punktfolge in km */
  lengthKm: number;
}

const TRKPT_RE = /<trkpt\s([^>]*?)\/?>/g;
const TIME_RE = /<time>([^<]+)<\/time>/;

export function parseGpx(xml: string): ParsedGpx | null {
  const raw: Array<[number, number]> = [];
  TRKPT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let firstTrkptIdx = -1;
  while ((m = TRKPT_RE.exec(xml))) {
    if (firstTrkptIdx === -1) firstTrkptIdx = m.index;
    const lat = parseFloat(attr(m[1], "lat") ?? "");
    const lon = parseFloat(attr(m[1], "lon") ?? "");
    if (isFinite(lat) && isFinite(lon)) raw.push([lat, lon]);
  }
  if (raw.length < 2) return null;

  let lengthM = 0;
  for (let i = 1; i < raw.length; i++) {
    lengthM += distM(raw[i - 1], raw[i]);
  }

  // Startzeit = Zeitstempel des ERSTEN Trackpunkts. Das <time> im
  // GPX-Header davor ist der Export-Zeitpunkt der Datei (Apple schreibt
  // dort das Erstellungsdatum) — damit würde kein Workout matchen.
  const startTime =
    firstTrkptIdx >= 0
      ? TIME_RE.exec(xml.slice(firstTrkptIdx, firstTrkptIdx + 500))?.[1]
      : undefined;

  return {
    startTime,
    points: simplify(raw),
    lengthKm: Math.round((lengthM / 1000) * 100) / 100,
  };
}

/** Punkte ausdünnen: Mindestabstand, adaptiv vergrößert bis ≤ maxPoints. */
export function simplify(
  raw: Array<[number, number]>,
  minStepM = 15,
  maxPoints = 600
): Array<[number, number]> {
  let step = minStepM;
  for (;;) {
    const out: Array<[number, number]> = [raw[0]];
    let last = raw[0];
    for (let i = 1; i < raw.length - 1; i++) {
      if (distM(last, raw[i]) >= step) {
        out.push([round5(raw[i][0]), round5(raw[i][1])]);
        last = raw[i];
      }
    }
    out.push(raw[raw.length - 1]);
    if (out.length <= maxPoints) return out;
    step *= 1.6;
  }
}

/** Abstand zweier Koordinaten in Metern (äquirektangulare Näherung). */
export function distM(a: [number, number], b: [number, number]): number {
  const kx = Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180) * 111320;
  const dx = (a[1] - b[1]) * kx;
  const dy = (a[0] - b[0]) * 110574;
  return Math.hypot(dx, dy);
}

function attr(tag: string, name: string): string | undefined {
  const needle = `${name}="`;
  const i = tag.indexOf(needle);
  if (i === -1) return undefined;
  const end = tag.indexOf('"', i + needle.length);
  if (end === -1) return undefined;
  return tag.slice(i + needle.length, end);
}

function round5(v: number): number {
  return Math.round(v * 100000) / 100000;
}
