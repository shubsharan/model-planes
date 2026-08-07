// US2 Acceptance Scenario 1: on a record where an intervention modified a
// proposal, `proposed`, `intervention`, and `applied` are all preserved and
// independently retrievable (SC-003; FR-006).
import { describe, expect, it } from "vitest";
import { parseDecisionRecord } from "../src/index.js";
import { buildSampleRecord } from "./fixtures/sample-trace.js";

describe("proposed/intervention/applied attribution (US2, FR-006, SC-003)", () => {
  it("keeps the raw proposal separate from the intervention and the applied command", () => {
    const record = buildSampleRecord();
    expect(record.proposed.kind).toBe("clearLand");
    expect(record.applied.kind).toBe("goAround");
    expect(record.intervention).not.toBeNull();
    expect(record.intervention?.reason).toBe("safety");
    expect(record.proposed).not.toEqual(record.applied);
  });

  it("round-trips a DecisionRecord through parseDecisionRecord, preserving all three fields", () => {
    const record = buildSampleRecord();
    const parsed = parseDecisionRecord(record);
    expect(parsed.ok).toBe(true);
    const value = parsed.unwrap();
    expect(value.proposed).toEqual(record.proposed);
    expect(value.intervention).toEqual(record.intervention);
    expect(value.applied).toEqual(record.applied);
  });

  it("permits intervention to be explicitly null when no modification occurred", () => {
    const record = buildSampleRecord();
    const unintervened = { ...record, intervention: null, applied: record.proposed };
    const parsed = parseDecisionRecord(unintervened);
    expect(parsed.ok).toBe(true);
    expect(parsed.unwrap().intervention).toBeNull();
  });

  it("rejects a DecisionRecord where the intervention field is missing entirely", () => {
    const record = buildSampleRecord();
    const { intervention: _intervention, ...withoutIntervention } = record;
    const parsed = parseDecisionRecord(withoutIntervention);
    expect(parsed.ok).toBe(false);
  });
});
