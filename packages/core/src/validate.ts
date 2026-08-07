// Validation boundary shared by every entity in this package: the current
// schema version, the structured error shape a rejected value carries, the
// Result type parse/validate functions return, and reusable integer/range/
// unique-id guards used across state.ts, command.ts, trace.ts, and
// serialize.ts.
//
// Hand-written validators, not a runtime schema-DSL dependency — core is the
// workspace dependency sink and must stay dependency-free (FR-012).
// See docs/features/0001-core-contracts/research.md (R2, R4) and FR-011.

/** Current integer schema version stamped on every WorldSnapshot and Trace (FR-007). */
export const SCHEMA_VERSION = 1;

/** Reason a value was rejected at the validation boundary. */
export type SchemaErrorReason =
  | "missing"
  | "out-of-range"
  | "wrong-kind"
  | "version-mismatch"
  | "duplicate-id"
  | "not-integer";

/** Structured rejection: names the offending field and why (FR-011). */
export interface SchemaError {
  readonly field: string;
  readonly reason: SchemaErrorReason;
  readonly message: string;
}

export function schemaError(
  field: string,
  reason: SchemaErrorReason,
  message: string,
): SchemaError {
  return { field, reason, message };
}

/** Thrown by `Result.unwrap()` when the result is an error. */
export class SchemaValidationError extends Error {
  readonly schemaError: SchemaError;

  constructor(error: SchemaError) {
    super(`${error.field}: ${error.message}`);
    this.name = "SchemaValidationError";
    this.schemaError = error;
  }
}

/** The outcome of a validation/parse boundary: a value or a structured error. */
export type Result<T, E extends SchemaError = SchemaError> =
  | { readonly ok: true; readonly value: T; unwrap(): T }
  | { readonly ok: false; readonly error: E; unwrap(): T };

export function ok<T, E extends SchemaError = SchemaError>(value: T): Result<T, E> {
  return { ok: true, value, unwrap: () => value };
}

export function err<T, E extends SchemaError = SchemaError>(error: E): Result<T, E> {
  return {
    ok: false,
    error,
    unwrap(): T {
      throw new SchemaValidationError(error);
    },
  };
}

// --- Reusable validation-boundary guards -----------------------------------

/** True only for a finite, integer number (ADR 0001: no floats in state/commands/trace). */
export function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function requireInteger(field: string, value: unknown): Result<number> {
  if (!isInteger(value)) {
    return err(schemaError(field, "not-integer", `${field} must be an integer, got ${String(value)}`));
  }
  return ok(value);
}

export function requireRange(
  field: string,
  value: number,
  min: number,
  max: number,
  options: { readonly maxExclusive?: boolean } = {},
): Result<number> {
  const withinLower = value >= min;
  const withinUpper = options.maxExclusive ? value < max : value <= max;
  if (!withinLower || !withinUpper) {
    const upperBrace = options.maxExclusive ? ")" : "]";
    return err(
      schemaError(
        field,
        "out-of-range",
        `${field} must be in [${min}, ${max}${upperBrace}, got ${value}`,
      ),
    );
  }
  return ok(value);
}

export function requireUniqueIds<T>(
  field: string,
  items: readonly T[],
  idOf: (item: T) => string,
): Result<readonly T[]> {
  const seen = new Set<string>();
  for (const item of items) {
    const id = idOf(item);
    if (seen.has(id)) {
      return err(schemaError(field, "duplicate-id", `duplicate id "${id}" in ${field}`));
    }
    seen.add(id);
  }
  return ok(items);
}

export function requireDefined<T>(field: string, value: T | undefined | null): Result<T> {
  if (value === undefined || value === null) {
    return err(schemaError(field, "missing", `${field} is required`));
  }
  return ok(value);
}
