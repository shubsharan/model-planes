// The declared, versioned rules of motion (spec FR-004).
//
// Every numeric constant and rule function the world engine's dynamics depend on
// lives here, in one place, so that "what rules produced this run?" has a single
// answer: `RULESET_VERSION` plus this file. Changing any value or any rule below
// changes observable behaviour and MUST increment `RULESET_VERSION`.
//
// Nothing here reads a clock, draws a random number, or calls a `Math`
// transcendental — those would break the byte-identical-replay guarantee
// (Constitution I, research R1).
import { MS_PER_TICK } from "@model-planes/core";

/**
 * Version of the motion + legality ruleset in force.
 *
 * Bump on any change to: a motion rule, a legality rule, the quantization step,
 * the fixed update order, or a declared default below. Callers record it into
 * trace `meta`, and every `TickOutcome` carries it, so a preserved run is
 * self-describing even if this file later changes.
 */
export const RULESET_VERSION = 1;

// --- Per-tick scaling (research R2) -----------------------------------------

/**
 * Milliseconds of simulated time in one tick, re-exported from the core time
 * base so the scaling rules below and the contract's tick resolution cannot
 * drift apart.
 */
export { MS_PER_TICK };

/** Milliseconds in one second — the denominator of every mm/s → mm/tick scaling. */
export const MS_PER_SECOND = 1000;

/**
 * Distance travelled in one tick, scaled by `MS_PER_SECOND`, for a speed in mm/s.
 *
 * Returned pre-division on purpose: `speed * MS_PER_TICK` is an exact integer
 * (both operands are integers well inside the 2^53 exact range), so the single
 * division by `MS_PER_SECOND` is deferred until after the trig multiply in
 * `positionDeltaMm`. Multiplying by a floating `MS_PER_TICK / MS_PER_SECOND`
 * (0.1, which is not representable in binary) would round twice instead of once
 * for no benefit.
 */
export function tickDistanceScaled(speedMmPerSec: number): number {
  return speedMmPerSec * MS_PER_TICK;
}

/**
 * A per-second rate (mm/s) expressed as its per-tick bound in whole mm.
 *
 * Used for the climb and descent limits, which the core contracts declare in
 * mm/s while altitude steps are per tick. Quantized under the declared rounding
 * rule so a rate that is not a multiple of 10 still yields one legal integer
 * bound rather than a float (ADR 0001).
 */
export function perTickMm(ratePerSecond: number): number {
  return quantizeHalfToEven((ratePerSecond * MS_PER_TICK) / MS_PER_SECOND);
}

// --- Boundary quantization (ADR 0001, research R2) ---------------------------

/**
 * Round a transient floating-point magnitude to an integer base unit,
 * round-half-to-even — the rounding ADR 0001 declares for every value leaving
 * the dynamics and entering state.
 *
 * This is the same rule as core's `quantizeToBaseUnit`, implemented here in
 * pure arithmetic because the position update runs twice per aircraft per tick
 * (3.6M times in the SC-005 budget) and core's version routes through decimal
 * string parsing to serve a different job — exact unit conversion from
 * arbitrary decimal input. Here the input is already a base-unit magnitude, so
 * `Math.floor` plus an exact fractional comparison is both faster and exact:
 * for |value| < 2^52 the subtraction `value - floor` is exact, and 0.5 is
 * exactly representable, so the tie test is never approximate.
 *
 * `Math.floor` and `Math.abs` are exact integer-valued operations, not
 * transcendentals — they carry no cross-platform ambiguity.
 */
export function quantizeHalfToEven(value: number): number {
  const negative = value < 0;
  const magnitude = negative ? -value : value;
  const floor = Math.floor(magnitude);
  const fraction = magnitude - floor;

  let rounded: number;
  if (fraction > 0.5) {
    rounded = floor + 1;
  } else if (fraction < 0.5) {
    rounded = floor;
  } else {
    // Exact tie: round to the even neighbour, which is what makes the step
    // unbiased over many roundings and identical on every platform.
    rounded = floor % 2 === 0 ? floor : floor + 1;
  }

  // `-1 * 0` is `-0`, which core's `isInteger` rejects as non-canonical.
  return negative && rounded !== 0 ? -rounded : rounded;
}

// --- Heading rules (research R3) ---------------------------------------------

/** One full turn in millidegrees; headings are integers modulo this. */
export const HEADING_WRAP_MILLIDEG = 360_000;

/**
 * Half a turn. A heading target exactly this far away is equidistant in both
 * directions, so the rule declares a tie-break: turn clockwise (the positive
 * direction). Without a declared tie-break the "shorter direction" rule would
 * have two legal answers at this one input, and the engine would not be a
 * function.
 */
export const HEADING_TIE_BREAK_MILLIDEG = 180_000;

/**
 * The signed shortest turn from `current` to `target`, in millidegrees, in
 * `(-180000, +180000]` — positive is clockwise. An exact half-turn returns
 * `+180000` per the tie-break above. All integer arithmetic.
 */
export function shortestTurnMillideg(current: number, target: number): number {
  const forward =
    (((target - current) % HEADING_WRAP_MILLIDEG) + HEADING_WRAP_MILLIDEG) % HEADING_WRAP_MILLIDEG;
  return forward <= HEADING_TIE_BREAK_MILLIDEG ? forward : forward - HEADING_WRAP_MILLIDEG;
}

/** Normalize any integer millidegree value into the contract's `[0, 360000)`. */
export function wrapHeadingMillideg(millideg: number): number {
  return ((millideg % HEADING_WRAP_MILLIDEG) + HEADING_WRAP_MILLIDEG) % HEADING_WRAP_MILLIDEG;
}

// --- Resource rules (research R8) --------------------------------------------

/**
 * Amount `fuelOrWindowRemaining` decreases by each tick. The declared default
 * rule: one unit per tick, floored at 0. Reaching 0 raises `fuelExhausted`
 * exactly once and flags the aircraft permanently; it keeps flying, because
 * removal policy belongs to a later feature (spec Assumptions).
 */
export const FUEL_DECREMENT_PER_TICK = 1;

// --- Speed rule (research R4) -------------------------------------------------

/**
 * Ruleset v1 applies an assigned speed in full at its effective tick — there is
 * no acceleration limit, because `AircraftPerformanceLimits` declares none and
 * inventing one would add dynamics the contracts cannot express (and that a
 * controller could not read off a snapshot). Legality still bounds the target to
 * `[minSpeed, maxSpeed]` at admission, so speed never leaves its declared range.
 * Adding an acceleration bound later is a ruleset *and* a contracts revision.
 */
export const SPEED_CONVERGES_INSTANTLY = true;
