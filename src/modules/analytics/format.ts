import { dayToDate } from "./dates";

const int = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function fmtInt(v: number): string {
  return int.format(v);
}

export function fmtKm(v: number): string {
  return `${one.format(v)} km`;
}

export function fmtKmh(v: number): string {
  return `${one.format(v)} km/h`;
}

/** Minuten -> "7 h 24 min" bzw. "45 min" */
export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Minuten -> "7:24" (Stunden:Minuten, z. B. für Schlaf) */
export function fmtHoursColon(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}:${m < 10 ? "0" : ""}${m}`;
}

/** min/km -> "5:32 /km" */
export function fmtPace(minPerKm: number): string {
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  const ss = s === 60 ? 0 : s;
  const mm = s === 60 ? m + 1 : m;
  return `${mm}:${ss < 10 ? "0" : ""}${ss} /km`;
}

const dateShort = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "numeric",
  month: "long",
});
const dateDayMonth = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
});
const dateFull = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const monthYear = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
});
const timeShort = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
});

/** "Di., 8. Juli" */
export function fmtDateShort(day: string): string {
  return dateShort.format(dayToDate(day));
}

/** "08.07." */
export function fmtDayMonth(day: string): string {
  return dateDayMonth.format(dayToDate(day));
}

/** "08.07.2026" */
export function fmtDateFull(day: string): string {
  return dateFull.format(dayToDate(day));
}

/** "Juli 2026" */
export function fmtMonthYear(day: string): string {
  return monthYear.format(dayToDate(day));
}

/** "07:12" aus ISO-Datum */
export function fmtTime(iso: string): string {
  return timeShort.format(new Date(iso));
}
