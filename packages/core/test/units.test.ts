// US3: convert a quantity from an alternate boundary unit and confirm it
// is exact; supply a quantity with no unit and confirm rejection (spec US3
// Independent Test; FR-009, SC-006).
import { describe, expect, it } from "vitest";
import { fromBaseUnit, quantizeToBaseUnit, toBaseUnit } from "../src/index.ts";

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

  // Regression: UNIT_TABLE is a plain object literal, so a bare index lookup
  // walks the prototype chain — a unit name that collides with an
  // Object.prototype member (e.g. "toString") must still be rejected as
  // unrecognized, not silently resolve to a prototype value.
  it.each(["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__"])(
    "rejects %p as an unrecognized unit rather than resolving it via the prototype chain",
    (unit) => {
      expect(toBaseUnit({ value: 5, unit }).ok).toBe(false);
      const result = fromBaseUnit(5, unit);
      expect(result.ok).toBe(false);
    },
  );

  // Regression: binary floating-point scaling computes 1.001 * 1000 as
  // 1000.9999999999999, which made an exactly-representable quantity read as
  // inexact. The conversion runs on the decimal mantissa in integer
  // arithmetic, so the residue cannot arise.
  it.each([
    [1.001, "m", 1_001],
    [0.001, "m", 1],
    [2.5, "m", 2_500],
    [1.005, "km", 1_005_000],
    [0.1, "deg", 100],
    [-1.001, "m", -1_001],
  ])("converts %p %s to the base unit without floating-point residue", (value, unit, expected) => {
    const result = toBaseUnit({ value, unit });
    expect(result.ok).toBe(true);
    expect(result.unwrap()).toBe(expected);
  });

  it("rejects a magnitude past the exact integer range (ADR 0001)", () => {
    expect(toBaseUnit({ value: 1e21, unit: "km" }).ok).toBe(false);
  });
});

// ADR 0001: "any value that enters state, a command, or the trace MUST be
// quantized to its canonical base unit at the boundary. Rounding at that
// boundary is round-half-to-even, declared and versioned."
describe("boundary quantization, round-half-to-even (ADR 0001)", () => {
  it("passes an exact conversion through unchanged", () => {
    expect(quantizeToBaseUnit({ value: 200, unit: "ms" }).unwrap()).toBe(2);
    expect(quantizeToBaseUnit({ value: 1.001, unit: "m" }).unwrap()).toBe(1_001);
  });

  it.each([
    [140, 1], // 1.4 -> 1, nearest
    [160, 2], // 1.6 -> 2, nearest
    [150, 2], // 1.5 -> 2, tie to even
    [250, 2], // 2.5 -> 2, tie to even
    [350, 4], // 3.5 -> 4, tie to even
    [50, 0], // 0.5 -> 0, tie to even
  ])("quantizes %pms to %p ticks", (ms, expected) => {
    expect(quantizeToBaseUnit({ value: ms, unit: "ms" }).unwrap()).toBe(expected);
  });

  it.each([
    [-150, -2], // -1.5 -> -2, tie to even
    [-250, -2], // -2.5 -> -2, tie to even
    [-140, -1],
    [-160, -2],
  ])("quantizes %pms symmetrically about zero to %p ticks", (ms, expected) => {
    expect(quantizeToBaseUnit({ value: ms, unit: "ms" }).unwrap()).toBe(expected);
  });

  it("never yields -0, which is not a canonical integer", () => {
    const result = quantizeToBaseUnit({ value: -40, unit: "ms" }).unwrap();
    expect(result).toBe(0);
    expect(Object.is(result, -0)).toBe(false);
  });

  it("still rejects a missing or ambiguous unit", () => {
    expect(quantizeToBaseUnit({ value: 150, unit: "" }).ok).toBe(false);
    expect(quantizeToBaseUnit({ value: 150, unit: "furlongs" }).ok).toBe(false);
  });
});
