import { BadRequestError } from "../errors";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;


export function validateUuid(value: unknown, fieldName = "id"): string {
  if (typeof value !== "string" || !UUID_REGEX.test(value)) {
    throw new BadRequestError(`Invalid ${fieldName}: must be a valid UUID.`);
  }
  return value;
}

export function validateOptionalUuid(
  value: unknown,
  fieldName = "id",
): string | null | undefined {
  if (value === undefined || value === null) {
    return value as null | undefined;
  }
  return validateUuid(value, fieldName);
}

export function validateNonEmptyString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestError(`${fieldName} is required and cannot be empty.`);
  }
  return value.trim();
}

export function validateOptionalString(
  value: unknown,
  _fieldName?: string,
): string | null | undefined {
  if (value === undefined || value === null) {
    return value as null | undefined;
  }
  if (typeof value !== "string") {
    return String(value).trim();
  }
  return value.trim();
}

export function parseDate(
  value: unknown,
  fieldName: string,
): Date {
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw new BadRequestError(`${fieldName} must be a valid date string or Date object.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestError(`Invalid date format for ${fieldName}.`);
  }
  return date;
}

export function parseOptionalDate(
  value: unknown,
  fieldName: string,
): Date | null | undefined {
  if (value === undefined || value === null || value === "") {
    return value === "" ? null : (value as null | undefined);
  }
  return parseDate(value, fieldName);
}

export function validateTimesOfDay(times: unknown): string[] {
  if (!Array.isArray(times) || times.length === 0) {
    throw new BadRequestError("timesOfDay must be a non-empty array of HH:MM strings.");
  }
  for (const time of times) {
    if (typeof time !== "string" || !TIME_REGEX.test(time)) {
      throw new BadRequestError(
        `Invalid time "${time}" in timesOfDay. Each entry must be in 24-hour HH:MM format (e.g., "08:00", "20:30").`,
      );
    }
  }
  return times;
}

export function validateDaysOfWeek(days: unknown): number[] {
  if (!Array.isArray(days) || days.length === 0) {
    throw new BadRequestError("daysOfWeek must be a non-empty array of day integers (0 to 7).");
  }
  const uniqueDays = new Set<number>();
  for (const day of days) {
    const parsed = Number(day);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 7) {
      throw new BadRequestError(`Invalid day "${day}" in daysOfWeek. Each entry must be an integer between 0 and 7.`);
    }
    uniqueDays.add(parsed);
  }
  return Array.from(uniqueDays).sort((a, b) => a - b);
}

export function getParamString(param: string | string[] | undefined): string {
  if (Array.isArray(param)) {
    return param[0] ?? "";
  }
  return param ?? "";
}

