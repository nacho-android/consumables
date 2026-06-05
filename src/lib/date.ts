import type { DatePreset, DateRange } from "../types";

export const DEFAULT_TIME_ZONE =
  import.meta.env?.VITE_DEFAULT_TIME_ZONE || "Australia/Sydney";

function partsFor(date: Date, timeZone = DEFAULT_TIME_ZONE): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function todayInSydney(): string {
  const parts = partsFor(new Date());
  return `${parts.year}-${parts.month}-${parts.day}`;
}

type DateTimeValue =
  | { toDate: () => Date }
  | { millis: number }
  | { seconds: number; nanoseconds?: number }
  | Date
  | number
  | null;

export function formatDateTime(value?: DateTimeValue): string {
  if (!value) return "";
  const date = toDate(value);
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: DEFAULT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function toDate(value: Exclude<DateTimeValue, null>): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if ("toDate" in value) return value.toDate();
  if ("millis" in value) return new Date(value.millis);
  return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1_000_000));
}

export function formatDate(value: string): string {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function localDateFromIso(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function rangeForPreset(preset: DatePreset): DateRange {
  const today = localDateFromIso(todayInSydney());
  const end = toIsoDate(today);
  const startDate = new Date(today);

  if (preset === "today") return { start: end, end };
  if (preset === "week") {
    const day = startDate.getDay();
    const diff = day === 0 ? 6 : day - 1;
    startDate.setDate(startDate.getDate() - diff);
  }
  if (preset === "month") startDate.setDate(1);
  if (preset === "year") {
    startDate.setMonth(0);
    startDate.setDate(1);
  }
  return { start: toIsoDate(startDate), end };
}

export function dateRangeLabel(range: DateRange): string {
  return `${formatDate(range.start)} to ${formatDate(range.end)}`;
}
