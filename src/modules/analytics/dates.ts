/** Kalendertag-Schlüssel (YYYY-MM-DD) — bewusst string-basiert, um
 * Zeitzonen-Verschiebungen beim Aggregieren zu vermeiden. */

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(day: string, delta: number): string {
  const d = new Date(
    Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))
  );
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Liste der letzten n Tage inkl. Endtag, aufsteigend. */
export function lastNDays(end: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}

export function dayToDate(day: string): Date {
  return new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
}

const WEEKDAY_LETTER = ["S", "M", "D", "M", "D", "F", "S"]; // getDay(): 0 = Sonntag

export function weekdayLetter(day: string): string {
  return WEEKDAY_LETTER[dayToDate(day).getDay()];
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
