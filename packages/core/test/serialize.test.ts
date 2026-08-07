// US2 Independent Test (spec.md): serialize/deserialize round-trip
// equality, byte-identical output across repeated serializations, and
// version-mismatch rejection on read (SC-002, SC-004; FR-007, FR-008).
import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, deserialize, serialize } from "../src/index.ts";
import { buildSampleTrace } from "./fixtures/sample-trace.ts";

describe("canonical deterministic serialization (US2, FR-007, FR-008)", () => {
  it("round-trips: deserialize(serialize(v)) deep-equals v (SC-002)", () => {
    const trace = buildSampleTrace();
    const bytes = serialize(trace);
    const back = deserialize(bytes).unwrap();
    expect(back).toEqual(trace);
  });

  it("serializes equal values to byte-identical output on repeated calls (SC-002)", () => {
    const first = serialize(buildSampleTrace());
    const second = serialize(buildSampleTrace()); // freshly built, structurally equal
    expect(first).toEqual(second);
  });

  it("uses sorted keys and no insignificant whitespace", () => {
    const bytes = serialize({ b: 1, a: 2 });
    expect(new TextDecoder().decode(bytes)).toBe('{"a":2,"b":1}');
  });

  it("rejects a non-integer number at serialize time (ADR 0001)", () => {
    expect(() => serialize({ heading: 90.5 })).toThrow();
  });

  it("rejects reading data written under a different schema version (SC-004, FR-007)", () => {
    const trace = buildSampleTrace();
    const bytes = serialize({ ...trace, schemaVersion: SCHEMA_VERSION + 1 });
    const result = deserialize(bytes);
    expect(result.ok).toBe(false);
  });

  it("accepts reading data written under the current schema version", () => {
    const bytes = serialize(buildSampleTrace());
    expect(deserialize(bytes).ok).toBe(true);
  });

  // `Number.isInteger(-0)` is true but `String(-0)` is `"0"`, so admitting -0
  // would mean a value that does not round-trip identically under `Object.is`
  // while still claiming to (ADR 0001 representation hazards).
  it("rejects -0, which cannot round-trip identically", () => {
    expect(() => serialize({ simTime: -0 })).toThrow();
  });

  it("round-trips every accepted number identically under Object.is", () => {
    const values = { zero: 0, positive: 42, negative: -42, large: 100_000_000 };
    const back = deserialize<typeof values>(serialize(values)).unwrap();
    for (const key of Object.keys(values) as (keyof typeof values)[]) {
      expect(Object.is(back[key], values[key])).toBe(true);
    }
  });

  it("rejects a non-numeric schemaVersion, which cannot equal the integer constant", () => {
    const bytes = new TextEncoder().encode('{"schemaVersion":"2"}');
    expect(deserialize(bytes).ok).toBe(false);
  });

  it.each([['{"schemaVersion":null}'], ['{"schemaVersion":1.5}'], ['{"schemaVersion":true}']])(
    "rejects malformed schemaVersion %s",
    (json) => {
      expect(deserialize(new TextEncoder().encode(json)).ok).toBe(false);
    },
  );
});
