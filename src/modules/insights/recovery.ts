/**
 * Erholungsstatus aus drei Signalen, jeweils gegen den persönlichen
 * Schnitt: Ruhepuls (erhöht = Ermüdung), HRV (gesenkt = Ermüdung) und
 * Schlafdauer der letzten Nacht. Ergebnis ist ein Score 0–100 mit
 * nachvollziehbaren Einzelkomponenten für die Begründung.
 */

export interface RecoveryInput {
  restingCurrent: number | null;
  restingAvg30: number | null;
  hrvCurrent: number | null;
  hrvAvg30: number | null;
  sleepLastMin: number | null;
  sleepAvg14Min: number | null;
}

export interface RecoveryResult {
  /** 0–100, null wenn gar keine Signale vorliegen */
  score: number | null;
  label: string;
  /** Ruhepuls-Abweichung in bpm (positiv = erhöht) */
  rhrDelta: number | null;
  /** HRV-Abweichung in % (negativ = gesenkt) */
  hrvDeltaPct: number | null;
  /** Schlaf letzte Nacht relativ zum 14-Tage-Schnitt (1 = normal) */
  sleepRatio: number | null;
}

export function computeRecovery(input: RecoveryInput): RecoveryResult {
  const parts: Array<{ score: number; weight: number }> = [];

  let rhrDelta: number | null = null;
  if (input.restingCurrent !== null && input.restingAvg30 !== null) {
    rhrDelta = Math.round((input.restingCurrent - input.restingAvg30) * 10) / 10;
    // -2 bpm -> ~94, 0 -> 70, +3 -> 34, +5 -> 10
    parts.push({ score: clamp(70 - rhrDelta * 12, 0, 100), weight: 0.4 });
  }

  let hrvDeltaPct: number | null = null;
  if (
    input.hrvCurrent !== null &&
    input.hrvAvg30 !== null &&
    input.hrvAvg30 > 0
  ) {
    hrvDeltaPct = Math.round(
      ((input.hrvCurrent - input.hrvAvg30) / input.hrvAvg30) * 100
    );
    // +10 % -> ~83, 0 -> 70, -15 % -> ~50, -30 % -> 31
    parts.push({ score: clamp(70 + hrvDeltaPct * 1.3, 0, 100), weight: 0.35 });
  }

  let sleepRatio: number | null = null;
  if (
    input.sleepLastMin !== null &&
    input.sleepAvg14Min !== null &&
    input.sleepAvg14Min > 0
  ) {
    sleepRatio = Math.round((input.sleepLastMin / input.sleepAvg14Min) * 100) / 100;
    // 100 % vom Schnitt -> 80, gedeckelt bei 115 %
    parts.push({ score: clamp(Math.min(sleepRatio, 1.15) * 80, 15, 100), weight: 0.25 });
  }

  if (!parts.length) {
    return { score: null, label: "Keine Daten", rhrDelta, hrvDeltaPct, sleepRatio };
  }

  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const score = Math.round(
    parts.reduce((a, p) => a + p.score * p.weight, 0) / totalWeight
  );

  return {
    score,
    label:
      score >= 75
        ? "Gut erholt"
        : score >= 55
          ? "Solide"
          : score >= 40
            ? "Angeschlagen"
            : "Erholung nötig",
    rhrDelta,
    hrvDeltaPct,
    sleepRatio,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
