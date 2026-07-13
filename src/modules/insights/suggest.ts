import type { Workout, WorkoutType } from "@/modules/health-model/types";
import type { RouteGroup } from "@/modules/analytics/routes";
import { paceMinPerKm, speedKmh, WORKOUT_LABEL } from "@/modules/analytics/workouts";
import { fmtKm, fmtKmh, fmtPace } from "@/modules/analytics/format";
import { loadStatus, type LoadStatus } from "./load";
import type { RecoveryResult } from "./recovery";

/**
 * Regelbasierte Trainingsvorschläge — bewusst transparent statt Blackbox:
 * Jeder Vorschlag nennt seine Gründe (Last, Erholung, Trainingsmuster) und
 * leitet konkrete Zielwerte (Distanz, Tempo, Puls) aus der eigenen
 * Historie ab, nie aus generischen Tabellen.
 */

export type SuggestionKind =
  | "rest"
  | "easy"
  | "normal"
  | "build"
  | "intervals"
  | "start";

export interface Suggestion {
  kind: SuggestionKind;
  /** z. B. "Lockerer Lauf" */
  title: string;
  /** konkrete Zielwerte, z. B. "≈ 4 km · gemütliche 6:10 /km · Puls unter 132" */
  detail: string;
  /** Streckenempfehlung, z. B. "Deine Parkrunde (≈ 5,6 km, 46× gelaufen)" */
  route?: string;
  reasons: string[];
}

export interface SuggestContext {
  /** chronologisch aufsteigend */
  workouts: Workout[];
  routeGroups: RouteGroup[];
  acwr: number | null;
  recovery: RecoveryResult;
  /** 0 = Sonntag … 6 = Samstag (echtes Heute) */
  todayWeekday: number;
  maxHR: number | null;
  daysSinceLastWorkout: number | null;
}

export function buildSuggestions(ctx: SuggestContext): {
  primary: Suggestion;
  alternative: Suggestion | null;
} {
  if (!ctx.workouts.length) {
    return {
      primary: {
        kind: "start",
        title: "Locker starten",
        detail:
          "20–30 min zügiges Gehen oder ein ganz lockerer Lauf — Hauptsache anfangen.",
        reasons: ["Noch keine Workouts in deinen Daten."],
      },
      alternative: null,
    };
  }

  const status = loadStatus(ctx.acwr);
  const reasons = collectReasons(ctx, status);
  const type = typicalTypeFor(ctx);

  // 1) Erholung hat Vorrang vor allem anderen
  if (ctx.recovery.score !== null && ctx.recovery.score < 40) {
    return {
      primary: {
        kind: "rest",
        title: "Heute: Regeneration",
        detail: pulseCapped(
          "Ruhetag — oder maximal 20–30 min lockeres Gehen/Radeln",
          ctx.maxHR,
          0.6
        ),
        reasons,
      },
      alternative: {
        kind: "rest",
        title: "Alternative: Mobility",
        detail: "15–20 min Dehnen oder Yoga — fördert die Erholung aktiv.",
        reasons: [],
      },
    };
  }

  // 2) Akute Last deutlich über der Grundlast -> Umfang rausnehmen
  if (status === "high" || (ctx.recovery.score !== null && ctx.recovery.score < 55)) {
    return {
      primary: easySuggestion(ctx, type, reasons),
      alternative: {
        kind: "rest",
        title: "Alternative: Ruhetag",
        detail: "Wenn sich die Beine schwer anfühlen: heute komplett pausieren.",
        reasons: [],
      },
    };
  }

  // 3) Viel Luft zur Grundlast + gut erholt -> Umfang aufbauen
  if (status === "low" && (ctx.recovery.score === null || ctx.recovery.score >= 60)) {
    return {
      primary: buildSuggestion(ctx, type, reasons),
      alternative: normalSuggestion(ctx, type, []),
    };
  }

  // 4) Normalfall: Einheit nach Wochenmuster, mit leichter Progression
  return {
    primary: normalSuggestion(ctx, type, reasons),
    alternative:
      type === "running" || type === "cycling"
        ? intervalSuggestion(ctx, type)
        : easySuggestion(ctx, type === "strength" ? "running" : type, []),
  };
}

// ------------------------------------------------------------ Bausteine

function normalSuggestion(
  ctx: SuggestContext,
  type: WorkoutType,
  reasons: string[]
): Suggestion {
  const label = WORKOUT_LABEL[type];

  if (type === "strength") {
    const avgMin = Math.round(avg(recent(ctx, "strength", 5).map((w) => w.durationMin)) || 40);
    return {
      kind: "normal",
      title: `Heute: ${label}`,
      detail: `≈ ${avgMin} min — wie deine übliche Mittwochseinheit.`,
      reasons,
    };
  }

  const recent5 = recent(ctx, type, 5);
  const dist = avg(recent5.map((w) => w.distanceKm ?? 0));
  const improving = isImproving(ctx, type);

  let tempo = "";
  if (type === "running") {
    const paces = recent5.map((w) => paceMinPerKm(w)).filter(isNum);
    if (paces.length) {
      const target = avg(paces) - (improving ? 5 / 60 : 0);
      tempo = ` · Ziel ${fmtPace(target)}${improving ? " (leichte Progression — dein Trend zeigt nach oben)" : ""}`;
    }
  } else {
    const speeds = recent5.map((w) => speedKmh(w)).filter(isNum);
    if (speeds.length) {
      const target = avg(speeds) + (improving ? 0.4 : 0);
      tempo = ` · Ziel ${fmtKmh(target)}${improving ? " (leichte Progression)" : ""}`;
    }
  }

  return {
    kind: "normal",
    title: `Heute: ${label}`,
    detail: dist > 0.5 ? `≈ ${fmtKm(roundHalf(dist))}${tempo}` : `wie gewohnt${tempo}`,
    route: routeHint(ctx, type, dist),
    reasons,
  };
}

function easySuggestion(
  ctx: SuggestContext,
  type: WorkoutType,
  reasons: string[]
): Suggestion {
  const label = WORKOUT_LABEL[type];
  const recent5 = recent(ctx, type, 5);
  const dist = avg(recent5.map((w) => w.distanceKm ?? 0)) * 0.6;

  let tempo = "";
  if (type === "running") {
    const paces = recent5.map((w) => paceMinPerKm(w)).filter(isNum);
    if (paces.length) tempo = ` · gemütliche ${fmtPace(avg(paces) + 40 / 60)}`;
  } else if (type === "cycling") {
    const speeds = recent5.map((w) => speedKmh(w)).filter(isNum);
    if (speeds.length) tempo = ` · entspannte ${fmtKmh(avg(speeds) * 0.85)}`;
  }

  return {
    kind: "easy",
    title: `Heute: Lockere Einheit (${label})`,
    detail: pulseCapped(
      dist > 0.5 ? `≈ ${fmtKm(roundHalf(dist))}${tempo}` : `kurz und locker${tempo}`,
      ctx.maxHR,
      0.72
    ),
    route: routeHint(ctx, type, dist),
    reasons,
  };
}

function buildSuggestion(
  ctx: SuggestContext,
  type: WorkoutType,
  reasons: string[]
): Suggestion {
  const label = WORKOUT_LABEL[type];
  const all = recent(ctx, type, 15);
  const longest = Math.max(...all.map((w) => w.distanceKm ?? 0), 0);
  const dist = Math.max(avg(recent(ctx, type, 5).map((w) => w.distanceKm ?? 0)) * 1.3, longest * 0.9);

  return {
    kind: "build",
    title: `Heute: Lange ${type === "cycling" ? "Ausfahrt" : "Einheit"} (${label})`,
    detail:
      dist > 0.5
        ? `≈ ${fmtKm(roundHalf(dist))} in ruhigem Grundlagentempo — der Umfang zählt, nicht das Tempo.`
        : "Deutlich länger als zuletzt, dafür bewusst ruhig.",
    route: routeHint(ctx, type, dist),
    reasons,
  };
}

function intervalSuggestion(ctx: SuggestContext, type: WorkoutType): Suggestion | null {
  const recent10 = recent(ctx, type, 10);
  if (recent10.length < 3) return null;

  if (type === "running") {
    const paces = recent10.map((w) => paceMinPerKm(w)).filter(isNum);
    if (!paces.length) return null;
    const best = Math.min(...paces);
    return {
      kind: "intervals",
      title: "Alternative: Intervalle",
      detail: `6 × 2 min zügig um ${fmtPace(best - 20 / 60)} mit je 2 min Trabpause — bringt Tempo in die Beine.`,
      reasons: [],
    };
  }
  const speeds = recent10.map((w) => speedKmh(w)).filter(isNum);
  if (!speeds.length) return null;
  const best = Math.max(...speeds);
  return {
    kind: "intervals",
    title: "Alternative: Intervalle",
    detail: `5 × 4 min bei ~${fmtKmh(best * 1.05)} mit lockerer Kurbelpause — klassisches Tempotraining.`,
    reasons: [],
  };
}

// ------------------------------------------------------------------ Kontext

function collectReasons(ctx: SuggestContext, status: LoadStatus): string[] {
  const out: string[] = [];

  if (ctx.acwr !== null) {
    const pct = Math.round((ctx.acwr - 1) * 100);
    if (status === "high")
      out.push(`Deine akute Trainingslast liegt ${pct} % über der 4-Wochen-Basis (ACWR ${fmtRatio(ctx.acwr)}).`);
    else if (status === "low")
      out.push(`Deine akute Last liegt ${Math.abs(pct)} % unter der 4-Wochen-Basis (ACWR ${fmtRatio(ctx.acwr)}) — Luft für mehr.`);
    else out.push(`Trainingslast im ausgewogenen Bereich (ACWR ${fmtRatio(ctx.acwr)}).`);
  }

  const r = ctx.recovery;
  if (r.rhrDelta !== null) {
    if (r.rhrDelta >= 2)
      out.push(`Ruhepuls ${fmtSigned(r.rhrDelta)} bpm über deinem 30-Tage-Schnitt — ein Ermüdungssignal.`);
    else if (r.rhrDelta <= -2)
      out.push(`Ruhepuls ${fmtSigned(r.rhrDelta)} bpm unter deinem Schnitt — gutes Zeichen.`);
  }
  if (r.hrvDeltaPct !== null && Math.abs(r.hrvDeltaPct) >= 8) {
    out.push(
      r.hrvDeltaPct < 0
        ? `HRV ${r.hrvDeltaPct} % unter deinem Schnitt.`
        : `HRV ${fmtSigned(r.hrvDeltaPct)} % über deinem Schnitt.`
    );
  }
  if (r.sleepRatio !== null && r.sleepRatio < 0.85) {
    out.push(`Letzte Nacht nur ${Math.round(r.sleepRatio * 100)} % deiner üblichen Schlafdauer.`);
  }
  if (ctx.daysSinceLastWorkout !== null && ctx.daysSinceLastWorkout >= 3) {
    out.push(`Seit ${ctx.daysSinceLastWorkout} Tagen kein Training.`);
  }

  return out.slice(0, 4);
}

/** Häufigster Workout-Typ für den heutigen Wochentag (letzte 12 Wochen),
 * sonst der insgesamt häufigste Typ. */
function typicalTypeFor(ctx: SuggestContext): WorkoutType {
  const recentAll = ctx.workouts.slice(-90);
  const byWeekday = new Map<WorkoutType, number>();
  const overall = new Map<WorkoutType, number>();

  for (const w of recentAll) {
    overall.set(w.type, (overall.get(w.type) ?? 0) + 1);
    const dow = new Date(w.day + "T12:00:00").getDay();
    if (dow === ctx.todayWeekday) byWeekday.set(w.type, (byWeekday.get(w.type) ?? 0) + 1);
  }

  const top = (m: Map<WorkoutType, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return top(byWeekday) ?? top(overall) ?? "running";
}

function routeHint(
  ctx: SuggestContext,
  type: WorkoutType,
  targetKm: number
): string | undefined {
  const candidates = ctx.routeGroups.filter((g) => g.type === type && g.count >= 2);
  if (!candidates.length) return undefined;
  const best =
    targetKm > 0.5
      ? candidates.reduce((a, b) =>
          Math.abs(b.medianKm - targetKm) < Math.abs(a.medianKm - targetKm) ? b : a
        )
      : candidates[0];
  if (targetKm > 0.5 && Math.abs(best.medianKm - targetKm) > targetKm * 0.5)
    return undefined;
  return `Passt zu deiner Strecke: ${best.label} · ≈ ${fmtKm(best.medianKm)} (${best.count}× absolviert)`;
}

// ------------------------------------------------------------------ Helfer

function recent(ctx: SuggestContext, type: WorkoutType, n: number): Workout[] {
  const out: Workout[] = [];
  for (let i = ctx.workouts.length - 1; i >= 0 && out.length < n; i--) {
    if (ctx.workouts[i].type === type) out.push(ctx.workouts[i]);
  }
  return out;
}

/** Tempo-Trend: letzte 3 gegen die 5 davor. */
function isImproving(ctx: SuggestContext, type: WorkoutType): boolean {
  const list = recent(ctx, type, 8).reverse();
  if (list.length < 5) return false;
  const metric = (w: Workout) =>
    type === "running" ? paceMinPerKm(w) : speedKmh(w);
  const older = list.slice(0, list.length - 3).map(metric).filter(isNum);
  const newer = list.slice(-3).map(metric).filter(isNum);
  if (!older.length || !newer.length) return false;
  return type === "running" ? avg(newer) < avg(older) : avg(newer) > avg(older);
}

function pulseCapped(text: string, maxHR: number | null, frac: number): string {
  return maxHR ? `${text} · Puls unter ~${Math.round(maxHR * frac)} bpm` : text;
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
function isNum(v: number | undefined): v is number {
  return v !== undefined && isFinite(v);
}
function roundHalf(v: number): number {
  return Math.round(v * 2) / 2;
}
function fmtRatio(v: number): string {
  return v.toFixed(2).replace(".", ",");
}
function fmtSigned(v: number): string {
  return `${v > 0 ? "+" : ""}${String(Math.round(v * 10) / 10).replace(".", ",")}`;
}
