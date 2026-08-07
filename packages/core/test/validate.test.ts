// Polish: consolidated malformed-input rejection across all entities
// (FR-011, SC-006). state-validate.test.ts already covers AircraftState,
// RunwayState, and Command in depth; this file rounds out the remaining
// entities — AircraftPerformanceLimits, WorldSnapshot schema-version
// mismatch, Intervention, DecisionRecord, Trace, and Seed.
import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  parseAircraftPerformanceLimits,
  parseDecisionRecord,
  parseIntervention,
  parseSeed,
  parseTrace,
  parseWorldSnapshot,
} from "../src/index.ts";
import { buildSampleRecord, buildSampleTrace } from "./fixtures/sample-trace.ts";

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

  it("rejects a Trace with a non-positive msPerTick", () => {
    const trace = buildSampleTrace();
    const result = parseTrace({ ...trace, msPerTick: 0 });
    expect(result.ok).toBe(false);
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
