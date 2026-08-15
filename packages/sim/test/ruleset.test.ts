// Direct unit tests for `ruleset.ts`'s rule functions — the pieces that used to
// be exercised only indirectly, through `advanceTick`.
//
// Three things are pinned down here:
//
//   - `perTickMm` never quantizes a positive rate to a zero per-tick bound. A
//     bound of 0 is not a slow climb — it is a permanent stall with no event,
//     because convergence tests `altitude === target` and that can never
//     become true (see `motion.test.ts`'s end-to-end regressions for the
//     consequence at the engine level).
//   - `nextFuel` floors at zero for any decrement, not only the one currently
//     declared.
//   - `quantizeHalfToEven` agrees with core's independently implemented
//     `quantizeToBaseUnit` — the link ADR 0001 requires between the two
//     implementations of the same declared rounding rule. If this test fails,
//     one of the two has drifted; that is the whole point of keeping it.
import { describe, expect, it } from "vitest";
import { quantizeToBaseUnit } from "@model-planes/core";
import { FUEL_DECREMENT_PER_TICK, nextFuel, perTickMm, quantizeHalfToEven } from "../src/ruleset.ts";

// --- perTickMm (research R2) --------------------------------------------------

describe("perTickMm never stalls a positive rate", () => {
  it("returns a nonzero bound somewhere in every ten consecutive ticks, for every rate 1-200", () => {
    for (let rate = 1; rate <= 200; rate++) {
      let total = 0;
      for (let tick = 1; tick <= 10; tick++) total += perTickMm(rate, tick);
      expect(total, `perTickMm(${rate}, 1..10) summed to 0 — this rate would stall`).toBeGreaterThan(
        0,
      );
    }
  });

  it("leaves a zero rate at zero on every tick", () => {
    for (let tick = 1; tick <= 5; tick++) {
      expect(perTickMm(0, tick)).toBe(0);
    }
  });

  it("quantizes an ordinary rate the same as the old rounding rule, on every tick", () => {
    // 20_000 mm/s and 30_000 mm/s are multiples of 10, so the tick-keyed budget
    // schedule produces the same constant bound `quantizeHalfToEven` did.
    for (let tick = 1; tick <= 5; tick++) {
      expect(perTickMm(20_000, tick)).toBe(2_000);
      expect(perTickMm(30_000, tick)).toBe(3_000);
    }
  });

  it("keeps the long-run mean rate exactly equal to the declared rate", () => {
    // 1_000 ticks * 100 ms/tick = 100_000 ms = 100 s; at 1 mm/s that is 100 mm.
    let total = 0;
    for (let tick = 1; tick <= 1_000; tick++) total += perTickMm(1, tick);
    expect(total).toBe(100);
  });

  it("keeps the budget schedule exact near the safe-integer tick ceiling", () => {
    expect(perTickMm(1, Number.MAX_SAFE_INTEGER - 2)).toBe(0);
    expect(perTickMm(1, Number.MAX_SAFE_INTEGER - 1)).toBe(1);
    expect(perTickMm(20_000, Number.MAX_SAFE_INTEGER)).toBe(2_000);
  });
});

// --- nextFuel (research R8) ---------------------------------------------------

describe("nextFuel floors at zero", () => {
  it("floors exactly at the declared decrement, for the currently declared value", () => {
    expect(nextFuel(FUEL_DECREMENT_PER_TICK)).toBe(0);
    expect(nextFuel(0)).toBe(0);
    expect(nextFuel(FUEL_DECREMENT_PER_TICK + 1)).toBe(1);
  });

  it("never returns a negative value regardless of how small `remaining` is", () => {
    for (let remaining = 0; remaining <= FUEL_DECREMENT_PER_TICK; remaining++) {
      expect(nextFuel(remaining)).toBeGreaterThanOrEqual(0);
    }
  });
});

// --- quantizeHalfToEven vs. core's quantizeToBaseUnit (ADR 0001) -------------

describe("quantizeHalfToEven agrees with core's quantizeToBaseUnit", () => {
  /** core's implementation, called over the `mm` unit — a 1:1 base-unit passthrough. */
  function coreQuantize(value: number): number {
    const result = quantizeToBaseUnit({ value, unit: "mm" });
    if (!result.ok) throw new Error(`test invariant: core rejected ${value}: ${result.error.message}`);
    return result.value;
  }

  // Excludes the literal `-0`: `quantizeHalfToEven`'s `-0` guard is keyed on
  // `value < 0`, which is false for `-0`, so a negative-zero *input* is its own
  // separate edge case — not one this rounding-agreement test is about, and not
  // reachable from the engine's own inputs (every `scaled` here is a
  // non-negative integer).
  // Values needing >15 significant decimal digits (e.g. the double nearest
  // 0.49999999999999994) are excluded: core's decimal-string parser rejects
  // them as exceeding ADR 0001's exact-integer range, which is a property of
  // that parsing route, not a rounding disagreement to test for here.
  const HAND_PICKED = [
    0, 0.5, -0.5, 1.5, -1.5, 2.5, -2.5, 3.5, -3.5, 100_000.5, -100_000.5, 1_234_567.5,
    -1_234_567.5, 999_999_999.5,
  ];

  it("agrees on a set of hand-picked exact-tie and near-tie magnitudes", () => {
    for (const value of HAND_PICKED) {
      expect(
        quantizeHalfToEven(value),
        `quantizeHalfToEven(${value}) disagreed with core's quantizeToBaseUnit`,
      ).toBe(coreQuantize(value));
    }
  });

  it("agrees on a dense half-integer sweep", () => {
    for (let tenths = -200; tenths <= 200; tenths++) {
      const value = tenths * 0.5;
      expect(quantizeHalfToEven(value)).toBe(coreQuantize(value));
    }
  });

  it("never produces -0", () => {
    for (const value of HAND_PICKED) {
      expect(Object.is(quantizeHalfToEven(value), -0)).toBe(false);
    }
  });
});
