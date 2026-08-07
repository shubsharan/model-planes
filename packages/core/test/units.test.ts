// US3: convert a quantity from an alternate boundary unit and confirm it
// is exact; supply a quantity with no unit and confirm rejection (spec US3
// Independent Test; FR-009, SC-006).
import { describe, expect, it } from "vitest";
import { fromBaseUnit, toBaseUnit } from "../src/index.ts";

describe("canonical unit conversions (US3, FR-009)", () => {
  it("converts an alternate distance unit to the canonical base unit exactly", () => {
    const result = toBaseUnit({ value: 5, unit: "m" });
    expect(result.ok).toBe(true);
    expect(result.unwrap()).toBe(5_000);
  });

  it("converts an alternate speed unit to the canonical base unit exactly", () => {
    const result = toBaseUnit({ value: 120, unit: "m/s" });
    expect(result.ok).toBe(true);
    expect(result.unwrap()).toBe(120_000);
  });

  it("converts an alternate time unit (ms) to ticks exactly when it divides evenly", () => {
    const result = toBaseUnit({ value: 200, unit: "ms" });
    expect(result.ok).toBe(true);
    expect(result.unwrap()).toBe(2);
  });

  it("rejects a conversion that would lose precision", () => {
    const result = toBaseUnit({ value: 150, unit: "ms" });
    expect(result.ok).toBe(false);
  });

  it("rejects a quantity with a missing unit", () => {
    const result = toBaseUnit({ value: 5, unit: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects a quantity with an unrecognized/ambiguous unit", () => {
    const result = toBaseUnit({ value: 5, unit: "furlongs" });
    expect(result.ok).toBe(false);
  });

  it("converts a base-unit value back out exactly where representable", () => {
    const result = fromBaseUnit(5_000, "m");
    expect(result.ok).toBe(true);
    expect(result.unwrap()).toBe(5);
  });

  it("rejects fromBaseUnit for an unrecognized unit", () => {
    const result = fromBaseUnit(5_000, "furlongs");
    expect(result.ok).toBe(false);
  });
});
