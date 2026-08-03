/** Thrown anywhere in a handler; the error middleware turns it into a response. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Body = Record<string, unknown>;

export function requireString(body: Body, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `"${field}" is required`);
  }
  return value.trim();
}

export function optionalString(body: Body, field: string): string {
  const value = body[field];
  return typeof value === "string" ? value.trim() : "";
}

export function stringArray(body: Body, field: string): string[] {
  const value = body[field];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new HttpError(400, `"${field}" must be an array of strings`);
  }
  return (value as string[]).map((v) => v.trim()).filter(Boolean);
}

export function optionalNumber(body: Body, field: string): number | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new HttpError(400, `"${field}" must be a non-negative number`);
  }
  return n;
}

export function oneOf<T extends string>(
  body: Body,
  field: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = body[field];
  if (value === undefined || value === null) return fallback;
  if (!allowed.includes(value as T)) {
    throw new HttpError(400, `"${field}" must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function matching(body: Body, field: string, pattern: RegExp, shape: string): string {
  const value = requireString(body, field);
  if (!pattern.test(value)) {
    throw new HttpError(400, `"${field}" must look like ${shape}`);
  }
  return value;
}

export const QUARTER = /^\d{4}-Q[1-4]$/;
export const WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
