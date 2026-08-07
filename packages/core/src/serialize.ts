// Canonical deterministic serialization (FR-008, ADR 0001): identical
// logical values produce byte-identical output — recursively sorted object
// keys, integers-only numbers (any non-integer number is rejected at
// serialize time), no insignificant whitespace — and a serialize-then-
// deserialize round trip reproduces an identical value. `deserialize`
// additionally rejects a value whose top-level `schemaVersion` differs from
// `SCHEMA_VERSION` (FR-007, SC-004).
import { SCHEMA_VERSION, SchemaValidationError, err, ok, schemaError, type Result } from "./validate.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
    const n = value as number;
    if (!Number.isInteger(n)) {
      throw new SerializationError(
        schemaError(path, "not-integer", `${path} must be an integer to serialize (ADR 0001)`),
      );
    }
    return String(n);
  }
  if (kind === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item, i) => canonicalize(item, `${path}[${i}]`)).join(",")}]`;
  }
  if (kind === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(obj[key], `${path}.${key}`)}`);
    return `{${entries.join(",")}}`;
  }
  throw new SerializationError(schemaError(path, "wrong-kind", `${path} of type ${kind} is not serializable`));
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
 * Parse bytes produced by `serialize`. Rejects input whose top-level
 * `schemaVersion` differs from `SCHEMA_VERSION` (FR-007, SC-004), and
 * rejects input that isn't valid JSON.
 */
export function deserialize<T = unknown>(bytes: Uint8Array): Result<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(textDecoder.decode(bytes));
  } catch {
    return err(schemaError("$", "wrong-kind", "input is not valid JSON"));
  }

  if (isRecord(parsed) && "schemaVersion" in parsed) {
    const schemaVersion = parsed["schemaVersion"];
    if (typeof schemaVersion === "number" && schemaVersion !== SCHEMA_VERSION) {
      return err(
        schemaError(
          "schemaVersion",
          "version-mismatch",
          `expected schemaVersion ${SCHEMA_VERSION}, got ${schemaVersion}`,
        ),
      );
    }
  }

  return ok(parsed as T);
}
