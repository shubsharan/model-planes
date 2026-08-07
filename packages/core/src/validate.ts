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
  | "not-integer"
  | "unknown-field";

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

/**
 * True only for a finite, integer number (ADR 0001: no floats in state/
 * commands/trace). `-0` is excluded: it is one of the representation hazards
 * ADR 0001 names, it is indistinguishable from `0` under `===` but not under
 * `Object.is`, and it does not survive canonical serialization (`String(-0)`
 * is `"0"`), so admitting it would break the round-trip identity guarantee.
 * This is the single definition of a canonical number — `serialize.ts` and
 * every parser funnel through it, so the exclusion holds everywhere.
 */
export function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && !Object.is(value, -0);
}

/** `String(-0)` is `"0"`, which would make a `-0` rejection unreadable. */
function describe(value: unknown): string {
  return Object.is(value, -0) ? "-0" : String(value);
}

export function requireInteger(field: string, value: unknown): Result<number> {
  if (!isInteger(value)) {
    return err(
      schemaError(field, "not-integer", `${field} must be an integer, got ${describe(value)}`),
    );
  }
  return ok(value);
}

/**
 * The record gate every parser opens with: rejects a non-object, and rejects
 * any key outside `knownKeys`. Unknown fields must surface as an explicit
 * error rather than being dropped (spec Edge Cases) — silently ignoring them
 * would let unsupported intent, including a coordinate or motion override on
 * a command (FR-004), pass as a valid value.
 */
export function requireRecord(
  field: string,
  input: unknown,
  knownKeys: readonly string[],
): Result<Record<string, unknown>> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return err(schemaError(field, "wrong-kind", `${field} must be an object`));
  }
  const record = input as Record<string, unknown>;
  const known = new Set(knownKeys);
  for (const key of Object.keys(record)) {
    if (!known.has(key)) {
      return err(
        schemaError(
          `${field}.${key}`,
          "unknown-field",
          `${field} has unknown field "${key}" — expected only ${knownKeys.join(", ")}`,
        ),
      );
    }
  }
  return ok(record);
}

/**
 * An integer field that only ever echoes a schema-declared constant
 * (`SCHEMA_VERSION`, `MS_PER_TICK`). Any other value means the data was
 * written under a different schema — ADR 0001 makes a change to a base unit
 * or the tick resolution a schema-version change — so the rejection reason is
 * `version-mismatch` rather than a range error.
 */
export function requireDeclaredConstant(
  field: string,
  input: unknown,
  expected: number,
): Result<number> {
  const value = requireInteger(field, input);
  if (!value.ok) return err(value.error);
  if (value.value !== expected) {
    return err(
      schemaError(field, "version-mismatch", `expected ${field} ${expected}, got ${value.value}`),
    );
  }
  return ok(value.value);
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

/**
 * Rejects a non-array `input`, then parses each element with `parseItem`,
 * bailing on the first failure. `parseItem` receives `${field}[i]` so a
 * rejected element's error names its position (e.g.
 * `WorldSnapshot.aircraft[2]`) the same way every other nested parser in
 * this package does.
 */
export function requireArray<T>(
  field: string,
  input: unknown,
  parseItem: (itemField: string, item: unknown) => Result<T>,
): Result<readonly T[]> {
  if (!Array.isArray(input)) {
    return err(schemaError(field, "wrong-kind", `${field} must be an array`));
  }
  const items: T[] = [];
  for (let i = 0; i < input.length; i++) {
    const parsed = parseItem(`${field}[${i}]`, input[i]);
    if (!parsed.ok) return err(parsed.error);
    items.push(parsed.value);
  }
  return ok(items);
}
