// Polish: consolidated malformed-input rejection across all entities
// (FR-011, SC-006). state-validate.test.ts already covers AircraftState,
// RunwayState, and Command in depth; this file rounds out the remaining
// entities — AircraftPerformanceLimits, WorldSnapshot schema-version
// mismatch, Intervention, DecisionRecord, Trace, and Seed.
import { describe, expect, it } from "vitest";
import {
  MS_PER_TICK,
  SCHEMA_VERSION,
  deserialize,
  parseAircraftPerformanceLimits,
  parseDecisionRecord,
  parseIntervention,
  parseSeed,
  parseTrace,
  parseWorldSnapshot,
  serialize,
} from "../src/index.ts";
import { buildSampleRecord, buildSampleSnapshot, buildSampleTrace } from "./fixtures/sample-trace.ts";

describe("consolidated malformed-input rejection (FR-011, SC-006)", () => {
  it("rejects AircraftPerformanceLimits where minSpeed exceeds maxSpeed", () => {
    const result = parseAircraftPerformanceLimits("limits", {
      minSpeed: 300_000,
      maxSpeed: 250_000,
      maxClimbRate: 15_000,
      maxDescentRate: 15_000,
      maxTurnRate: 300,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects AircraftPerformanceLimits with a negative rate", () => {
    const result = parseAircraftPerformanceLimits("limits", {
      minSpeed: 60_000,
      maxSpeed: 250_000,
      maxClimbRate: -1,
      maxDescentRate: 15_000,
      maxTurnRate: 300,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a WorldSnapshot written under a different schema version", () => {
    const result = parseWorldSnapshot({
      schemaVersion: SCHEMA_VERSION + 1,
      simTime: 0,
      aircraft: [],
      runways: [],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an Intervention with an unrecognized reason", () => {
    const result = parseIntervention("intervention", { reason: "vibes" });
    expect(result.ok).toBe(false);
  });

  it("rejects an Intervention whose detail is not a string", () => {
    const result = parseIntervention("intervention", { reason: "safety", detail: 42 });
    expect(result.ok).toBe(false);
  });

  it("accepts a well-formed Intervention", () => {
    expect(parseIntervention("intervention", { reason: "legality" }).ok).toBe(true);
  });

  it("rejects a DecisionRecord with a negative index", () => {
    const record = buildSampleRecord();
    const result = parseDecisionRecord({ ...record, index: -1 });
    expect(result.ok).toBe(false);
  });

  it("rejects a DecisionRecord whose messages field is not an array", () => {
    const record = buildSampleRecord();
    const result = parseDecisionRecord({ ...record, messages: "not-an-array" });
    expect(result.ok).toBe(false);
  });

  it("rejects a DecisionRecord whose margins field is missing", () => {
    const record = buildSampleRecord();
    const { margins: _margins, ...withoutMargins } = record;
    const result = parseDecisionRecord(withoutMargins);
    expect(result.ok).toBe(false);
  });

  it("rejects a Trace written under a different schema version", () => {
    const trace = buildSampleTrace();
    const result = parseTrace({ ...trace, schemaVersion: SCHEMA_VERSION + 1 });
    expect(result.ok).toBe(false);
  });

  // msPerTick is fixed by the schema, not chosen per trace: a trace declaring
  // 200 would silently reinterpret every recorded timestamp against a 100ms
  // tick. ADR 0001 makes a change to the base unit a schema-version change.
  it.each([[0], [200], [1]])("rejects a Trace whose msPerTick is %p rather than the declared MS_PER_TICK", (ms) => {
    const result = parseTrace({ ...buildSampleTrace(), msPerTick: ms });
    expect(result.ok).toBe(false);
  });

  it("accepts a Trace whose msPerTick matches the declared resolution", () => {
    const result = parseTrace({ ...buildSampleTrace(), msPerTick: MS_PER_TICK });
    expect(result.ok).toBe(true);
  });

  it("rejects a Trace whose records are out of order", () => {
    const record = buildSampleRecord();
    const trace = {
      schemaVersion: SCHEMA_VERSION,
      seed: { root: 42 },
      msPerTick: 100,
      records: [
        { ...record, index: 1 },
        { ...record, index: 0 },
      ],
    };
    const result = parseTrace(trace);
    expect(result.ok).toBe(false);
  });

  it("accepts a well-formed Trace", () => {
    expect(parseTrace(buildSampleTrace()).ok).toBe(true);
  });

  it("rejects a Seed with a non-integer root", () => {
    const result = parseSeed({ root: 1.5 });
    expect(result.ok).toBe(false);
  });

  it("rejects a Seed missing its root field", () => {
    const result = parseSeed({});
    expect(result.ok).toBe(false);
  });

  it("accepts a well-formed Seed", () => {
    expect(parseSeed({ root: 42 }).ok).toBe(true);
  });
});

// "An unknown command type or unknown field encountered while reading must
// surface as an explicit error, not be dropped." (spec.md Edge Cases)
describe("unknown-field rejection at every boundary (FR-011, SC-006)", () => {
  it("rejects an unknown top-level field on a DecisionRecord", () => {
    const result = parseDecisionRecord({ ...buildSampleRecord(), score: 7 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.reason).toBe("unknown-field");
  });

  it("names the offending field so the error is actionable", () => {
    const result = parseTrace({ ...buildSampleTrace(), replayHint: "fast" });
    expect(result.ok === false && result.error.field).toBe("Trace.replayHint");
  });

  it("rejects an unknown field nested inside a WorldSnapshot", () => {
    const snapshot = buildSampleSnapshot();
    const [aircraft] = snapshot.aircraft;
    const result = parseWorldSnapshot({
      ...snapshot,
      aircraft: [{ ...aircraft, transponder: "7700" }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown field on an Intervention", () => {
    const result = parseIntervention("intervention", { reason: "safety", severity: 3 });
    expect(result.ok).toBe(false);
  });
});

// FR-007 / ADR 0001: "an explicit schema-version tag on every trace and
// record", so a record lifted out of its trace stays self-describing.
describe("every record is independently versioned (FR-007, SC-004)", () => {
  it("rejects a DecisionRecord carrying no schemaVersion", () => {
    const { schemaVersion: _version, ...withoutVersion } = buildSampleRecord();
    expect(parseDecisionRecord(withoutVersion).ok).toBe(false);
  });

  it("rejects a DecisionRecord written under a different schema version", () => {
    const result = parseDecisionRecord({
      ...buildSampleRecord(),
      schemaVersion: SCHEMA_VERSION + 1,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.reason).toBe("version-mismatch");
  });

  it("accepts a record standing alone, without its enclosing trace", () => {
    expect(parseDecisionRecord(buildSampleRecord()).ok).toBe(true);
  });
});

// FR-008/FR-012: margins, meta and messages are opaque to this contract, but
// a record that parses must be one that can actually be persisted and
// replayed — so the parse boundary enforces the serializable value domain.
describe("opaque payloads are validated against the canonical domain (FR-008)", () => {
  it.each([
    ["a float", { separation: 1.5 }],
    ["undefined", { separation: undefined }],
    ["a function", { compute: () => 1 }],
    ["a nested float", { nested: { deep: [1, 2.5] } }],
    ["-0", { separation: -0 }],
  ])("rejects margins containing %s", (_label, margins) => {
    expect(parseDecisionRecord({ ...buildSampleRecord(), margins }).ok).toBe(false);
  });

  it("rejects meta and messages by the same rule", () => {
    const record = buildSampleRecord();
    expect(parseDecisionRecord({ ...record, meta: { temperature: 0.7 } }).ok).toBe(false);
    expect(parseDecisionRecord({ ...record, messages: [{ tokens: 1.5 }] }).ok).toBe(false);
  });

  it("accepts nested integers, strings, booleans, null, and arrays", () => {
    const margins = { sep: 300_000, tag: "tight", breached: false, note: null, series: [1, 2, 3] };
    expect(parseDecisionRecord({ ...buildSampleRecord(), margins }).ok).toBe(true);
  });

  // The point of validating the opaque payloads at all: parse success is only
  // useful if it implies the record survives the round trip it promises.
  it("guarantees that a parsed record serializes", () => {
    const record = parseDecisionRecord(buildSampleRecord()).unwrap();
    expect(() => serialize(record)).not.toThrow();
    expect(deserialize(serialize(record)).unwrap()).toEqual(record);
  });
});
