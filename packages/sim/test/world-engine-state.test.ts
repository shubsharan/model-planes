// T004: `createWorldEngineState` wraps a contract-valid snapshot as the initial
// world engine state, and delegates every rejection to the core parser.
//
// The delegation is the point of the second describe block below: the world
// engine must not invent an error vocabulary of its own. If it re-phrased or
// re-classified a core `SchemaError`, callers would have two overlapping
// vocabularies to interpret for the same malformed input, and the core reason
// codes (`version-mismatch`, `duplicate-id`, ...) would stop being the single
// answer to "why was this rejected?". So each case asserts the returned error
// deep-equals the error `parseWorldSnapshot` gives for that very same input.
import { describe, expect, it } from "vitest";
import { type SchemaError, parseWorldSnapshot } from "@model-planes/core";
import { createWorldEngineState } from "../src/world-engine-state.ts";
import { aircraft, manyAircraft, runway, snapshot } from "./fixtures.ts";

/** The error the core parser produces for `input` — fails loudly if it accepts. */
function coreErrorFor(input: unknown): SchemaError {
  const parsed = parseWorldSnapshot(input);
  if (parsed.ok) {
    throw new Error("test invariant: this input was expected to be contract-invalid");
  }
  return parsed.error;
}

/** Asserts the world engine rejected `input` with the core parser's own error. */
function expectCoreRejection(input: unknown): void {
  const result = createWorldEngineState(input);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toEqual(coreErrorFor(input));
}

describe("createWorldEngineState accepts a contract-valid snapshot", () => {
  it("wraps a single-aircraft snapshot with empty assignments and flags", () => {
    const input = snapshot();
    const result = createWorldEngineState(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.snapshot).toEqual(parseWorldSnapshot(input).unwrap());
    expect(result.value.assignments.size).toBe(0);
    expect(result.value.exited.size).toBe(0);
    expect(result.value.exhausted.size).toBe(0);
  });

  it("wraps a multi-aircraft snapshot carrying a runway", () => {
    const input = snapshot({ simTime: 7, aircraft: manyAircraft(5), runways: [runway()] });
    const result = createWorldEngineState(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.snapshot).toEqual(parseWorldSnapshot(input).unwrap());
    expect(result.value.assignments.size).toBe(0);
    expect(result.value.exited.size).toBe(0);
    expect(result.value.exhausted.size).toBe(0);
  });
});

describe("createWorldEngineState rejects with the core parser's own error", () => {
  it("rejects a snapshot stamped with a different schema version", () => {
    expectCoreRejection({ ...snapshot(), schemaVersion: 999 });
  });

  it("rejects a non-integer simTime", () => {
    expectCoreRejection({ ...snapshot(), simTime: 1.5 });
  });

  it("rejects a negative simTime", () => {
    expectCoreRejection({ ...snapshot(), simTime: -1 });
  });

  // 360000 millidegrees is the exclusive upper end of the heading range: the
  // same bearing as 0, but not the canonical encoding of it.
  it("rejects an aircraft heading at the exclusive top of the range", () => {
    expectCoreRejection({ ...snapshot(), aircraft: [{ ...aircraft(), heading: 360_000 }] });
  });

  it("rejects duplicate aircraft ids", () => {
    expectCoreRejection({ ...snapshot(), aircraft: [aircraft(), aircraft()] });
  });
});

describe("createWorldEngineState takes `unknown`, not a pre-parsed snapshot", () => {
  it("rejects null", () => {
    expectCoreRejection(null);
  });

  it("rejects a number", () => {
    expectCoreRejection(42);
  });

  it("rejects an empty object", () => {
    expectCoreRejection({});
  });
});

// The fixtures are only useful if they really are contract-valid — otherwise a
// later suite's failure would be ambiguous between the engine and its inputs.
describe("fixtures produce contract-valid snapshots", () => {
  it("accepts the default snapshot", () => {
    expect(parseWorldSnapshot(snapshot()).ok).toBe(true);
  });

  it("accepts a snapshot of many aircraft plus a runway", () => {
    const input = snapshot({ aircraft: manyAircraft(5), runways: [runway()] });
    expect(parseWorldSnapshot(input).ok).toBe(true);
  });
});
