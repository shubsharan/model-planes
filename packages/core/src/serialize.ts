// Canonical deterministic serialization (FR-008, ADR 0001): identical
// logical values produce byte-identical output — recursively sorted object
// keys, integers-only numbers (any non-integer number is rejected at
// serialize time), no insignificant whitespace — and a serialize-then-
// deserialize round trip reproduces an identical value. `deserialize`
// additionally rejects a value whose top-level `schemaVersion` differs from
// `SCHEMA_VERSION` (FR-007, SC-004).
import {
  SCHEMA_VERSION,
  SchemaValidationError,
  err,
  isInteger,
  ok,
  requireDeclaredConstant,
  schemaError,
  type Result,
} from "./validate.ts";

/** Thrown by `serialize()` when a value cannot be canonically encoded. */
export class SerializationError extends SchemaValidationError {
  constructor(error: ReturnType<typeof schemaError>) {
    super(error);
    this.name = "SerializationError";
  }
}

function canonicalize(value: unknown, path: string): string {
  if (value === null) return "null";
  const kind = typeof value;
  if (kind === "boolean") return value ? "true" : "false";
  if (kind === "number") {
    // The shared `isInteger` — not `Number.isInteger` — so the canonical
    // number domain is defined in exactly one place. It also excludes `-0`,
    // which `String` would emit as `"0"` and silently break round-trip
    // identity under `Object.is` (ADR 0001 representation hazards).
    if (!isInteger(value)) {
      throw new SerializationError(
        schemaError(path, "not-integer", `${path} must be an integer to serialize (ADR 0001)`),
      );
    }
    return String(value);
  }
  if (kind === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item, i) => canonicalize(item, `${path}[${i}]`)).join(",")}]`;
  }
  if (kind === "object") {
    // `Date`/`Map`/`Set`/typed arrays are `typeof "object"` but have no own
    // enumerable keys, so without this check they would silently canonicalize
    // to `{}` instead of being rejected — quietly destroying the value rather
    // than honoring the "guaranteed to persist and replay" contract.
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new SerializationError(
        schemaError(path, "wrong-kind", `${path} must be a plain object (ADR 0001)`),
      );
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${canonicalize(obj[key], `${path}.${key}`)}`,
    );
    return `{${entries.join(",")}}`;
  }
  throw new SerializationError(
    schemaError(path, "wrong-kind", `${path} of type ${kind} is not serializable`),
  );
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Serialize a value to the canonical deterministic encoding: sorted object
 * keys, integers-only numbers, no insignificant whitespace. Equal values
 * serialize to byte-identical output on every platform and process
 * (FR-008, SC-002). Throws `SerializationError` for a non-integer number or
 * an otherwise unserializable value (functions, symbols, `undefined`).
 */
export function serialize(value: unknown): Uint8Array {
  return textEncoder.encode(canonicalize(value, "$"));
}

/**
 * Validate that `value` lies in the canonical serializable value domain:
 * `null`, booleans, strings, canonical integers, and arrays/plain objects of
 * those, recursively.
 *
 * `canonicalize` *is* the definition of that domain, so this asks it directly
 * rather than reimplementing the walk — a parallel validator would be free to
 * drift from the encoder, which is exactly the mismatch this closes. Used by
 * `parseDecisionRecord` on the opaque payloads it does not otherwise inspect,
 * so that a record which parses is guaranteed to serialize (FR-008, FR-012).
 */
export function requireCanonicalValue<T>(field: string, value: unknown): Result<T> {
  try {
    canonicalize(value, field);
  } catch (error) {
    if (error instanceof SerializationError) return err(error.schemaError);
    throw error;
  }
  return ok(value as T);
}

/** An opaque payload map: a plain object whose every nested value is canonical. */
export function requireCanonicalRecord(
  field: string,
  value: unknown,
): Result<Readonly<Record<string, unknown>>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return err(schemaError(field, "wrong-kind", `${field} must be an object`));
  }
  return requireCanonicalValue<Readonly<Record<string, unknown>>>(field, value);
}

/**
 * Parse bytes produced by `serialize`. Rejects input whose top-level
 * `schemaVersion` differs from `SCHEMA_VERSION` (FR-007, SC-004), and
 * rejects input that isn't valid JSON.
 *
 * `T` is an unchecked cast, not a validated shape — this only confirms the
 * bytes are JSON and, if present, that `schemaVersion` matches. A caller
 * that needs a real `Trace`/`DecisionRecord`/etc. must run the result
 * through the matching `parseX` function (e.g. `parseTrace`), which is the
 * only thing that actually validates the shape.
 */
export function deserialize<T = unknown>(bytes: Uint8Array): Result<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(textDecoder.decode(bytes));
  } catch {
    return err(schemaError("$", "wrong-kind", "input is not valid JSON"));
  }

  // A present `schemaVersion` must equal `SCHEMA_VERSION` — routed through the
  // shared check so a malformed or foreign tag (`"2"`, `null`, `1.5`) is a
  // rejection too. Comparing only mismatching *numbers* would let a version
  // that cannot possibly equal the integer constant through unchecked.
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    "schemaVersion" in parsed
  ) {
    const schemaVersion = requireDeclaredConstant(
      "schemaVersion",
      (parsed as Record<string, unknown>)["schemaVersion"],
      SCHEMA_VERSION,
    );
    if (!schemaVersion.ok) return err(schemaVersion.error);
  }

  return ok(parsed as T);
}
