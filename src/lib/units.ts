export const ALLOWED_UNITS = ["each", "box", "daily"] as const;

export type AllowedUnit = (typeof ALLOWED_UNITS)[number];

export const FALLBACK_UNIT: AllowedUnit = "each";

export function isAllowedUnit(value: string): value is AllowedUnit {
  return (ALLOWED_UNITS as readonly string[]).includes(value);
}

export function safeUnit(value: string | undefined | null): AllowedUnit {
  const trimmed = value?.trim() ?? "";
  return isAllowedUnit(trimmed) ? trimmed : FALLBACK_UNIT;
}
