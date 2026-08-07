// T013/T014: commanded motion — convergence toward assigned targets and the
// resolution of duplicate assignments (spec US2; FR-004 declared ruleset,
// FR-005 limit enforcement, FR-006 effective-time honouring; research R3
// heading, R4 speed, R5 effective time, R6 supersession).
//
// Three rules are pinned down here, and all three are about *authority*, not
// about eventual arrival:
//
//   - Convergence is bounded per tick and exact at the end. Heading moves at
//     most `maxTurnRate` millidegrees per tick in the shorter direction (with
//     `+180000` as the declared tie-break, so an exact half-turn has one legal
//     answer), altitude at most the applicable climb/descent bound, and both
//     snap exactly onto the target on the tick they can reach it — never
//     overshooting and never approaching asymptotically. Speed is the deliberate
//     exception: ruleset v1 declares no acceleration limit, so an assigned speed
//     applies in full at its effective tick.
//   - A target, once attained, is simply held. `targetReached` reports the
//     arrival *transition*, so every assertion below counts occurrences across a
//     whole run rather than looking at the arrival tick in isolation.
//   - Supersession is an outcome, not a rejection. Two commands of the same kind
//     for the same aircraft at the same effective tick collapse to the later
//     one, and the earlier one stays visible in `outcome.superseded`. Commands
//     of different kinds never collide, so they compose.
//
// Steering runs before motion (research R2), so a turn commanded on a tick
// affects that same tick's displacement. `test/harness.ts`'s `advance` checks
// this on every tick of every suite (see `expectDisplacementDeclared` there);
// the "bends the same tick's displacement" block below additionally pins three
// absolute positions by hand, since that blanket check is relational (it
// compares the reported position against the reported heading/speed) and
// cannot by itself catch the reported heading or speed being wrong.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIMITS,
  aircraft,
  altitudeCommand,
  headingCommand,
  speedCommand,
} from "./fixtures.ts";
import {
  type TickOutcome,
  planeIn,
  run,
  runWithFirstBatch,
  stateOver,
  tickAt,
} from "./harness.ts";
import { perTickMm, shortestTurnMillideg } from "../src/ruleset.ts";

// --- Local helpers -----------------------------------------------------------

/** Per-tick heading authority of the fixture aircraft, in millidegrees. */
const MAX_TURN = DEFAULT_LIMITS.maxTurnRate;

/**
 * Per-tick climb/descent bound in mm, for the fixture's declared rates. Both
 * rates are multiples of 10 mm/s, so `perTickMm` returns the same bound on
 * every tick regardless of which tick is asked — the tick argument only
 * matters for a rate under 10 mm/s (see the stall regressions below).
 */
const CLIMB_STEP = perTickMm(DEFAULT_LIMITS.maxClimbRate, 1);
const DESCENT_STEP = perTickMm(DEFAULT_LIMITS.maxDescentRate, 1);

const headings = (outcomes: readonly TickOutcome[]): readonly number[] =>
  outcomes.map((outcome) => planeIn(outcome, "AC-1").heading);

const altitudes = (outcomes: readonly TickOutcome[]): readonly number[] =>
  outcomes.map((outcome) => planeIn(outcome, "AC-1").position.z);

const speeds = (outcomes: readonly TickOutcome[]): readonly number[] =>
  outcomes.map((outcome) => planeIn(outcome, "AC-1").speed);

/** Indices of the outcomes carrying a `targetReached` for `dimension` and `id`. */
function reachedIndices(
  outcomes: readonly TickOutcome[],
  dimension: "heading" | "altitude" | "speed",
  id: string,
): readonly number[] {
  return outcomes.flatMap((outcome, index) =>
    outcome.events.some(
      (event) =>
        event.kind === "targetReached" && event.dimension === dimension && event.aircraftId === id,
    )
      ? [index]
      : [],
  );
}

/** Asserts no tick turned further than the aircraft's declared authority. */
function expectTurnRateRespected(initialHeading: number, sequence: readonly number[]): void {
  let previous = initialHeading;
  for (const next of sequence) {
    // Measured as a signed shortest turn, so a step that wrapped through 0 is
    // 3_000 millidegrees rather than a spurious 357_000.
    expect(Math.abs(shortestTurnMillideg(previous, next))).toBeLessThanOrEqual(MAX_TURN);
    previous = next;
  }
}

/** Asserts no tick changed altitude by more than the applicable bound. */
function expectAltitudeRateRespected(initialAltitude: number, sequence: readonly number[]): void {
  let previous = initialAltitude;
  for (const next of sequence) {
    const delta = next - previous;
    expect(delta).toBeLessThanOrEqual(CLIMB_STEP);
    expect(-delta).toBeLessThanOrEqual(DESCENT_STEP);
    previous = next;
  }
}

/** Asserts speed never left the aircraft's declared envelope. */
function expectSpeedWithinLimits(outcomes: readonly TickOutcome[]): void {
  for (const speed of speeds(outcomes)) {
    expect(speed).toBeGreaterThanOrEqual(DEFAULT_LIMITS.minSpeed);
    expect(speed).toBeLessThanOrEqual(DEFAULT_LIMITS.maxSpeed);
  }
}

// --- Same-tick displacement (research R2) ------------------------------------

describe("advanceTick bends the same tick's displacement by what it commands", () => {
  // maxTurnRate is 3_000 millideg, so the post-steering heading is 3°, and the
  // 10_000 mm step resolves along it: (9986, 523), computed via the engine's
  // own trig — not (10_000, 0), which is what using the PREVIOUS heading 0
  // would report.
  it("uses the post-steering heading, not the one the tick started on", () => {
    const outcomes = runWithFirstBatch(stateOver([aircraft({ heading: 0, speed: 100_000 })]), 2, [
      headingCommand("AC-1", 90_000, 0, 1),
    ]);
    const first = planeIn(tickAt(outcomes, 0), "AC-1");

    expect(first.heading).toBe(3_000);
    expect(first.position).toEqual({ x: 9_986, y: 523, z: 1_000_000 });
  });

  // Heading 0 the whole tick, so cos(0) is exactly 1 and the step is plain
  // integer arithmetic — the one anchor that needs no trig approximation at all.
  it("uses the commanded speed for the same tick's displacement", () => {
    const outcomes = runWithFirstBatch(stateOver([aircraft({ heading: 0, speed: 100_000 })]), 2, [
      speedCommand("AC-1", 200_000, 0, 1),
    ]);
    const first = planeIn(tickAt(outcomes, 0), "AC-1");

    expect(first.speed).toBe(200_000);
    expect(first.position.x).toBe(20_000); // not 10_000, the pre-command step
  });

  // Composition: both axes commanded together, and the step must use both new
  // values — not one new and one old.
  it("uses both the new heading and the new speed when they are commanded together", () => {
    const outcomes = runWithFirstBatch(stateOver([aircraft({ heading: 0, speed: 100_000 })]), 2, [
      headingCommand("AC-1", 90_000, 0, 1),
      speedCommand("AC-1", 200_000, 0, 1),
    ]);
    const first = planeIn(tickAt(outcomes, 0), "AC-1");

    expect(first.position).toEqual({ x: 19_973, y: 1_047, z: 1_000_000 });
  });
});

// --- T013: convergence -------------------------------------------------------

describe("advanceTick converges an aircraft toward assigned targets within its limits", () => {
  // --- Heading (research R3) -------------------------------------------------

  it("turns at maxTurnRate and arrives exactly on the target tick", () => {
    // 90_000 / 3_000 = 30 ticks of full authority, with nothing left to snap.
    const outcomes = runWithFirstBatch(stateOver([aircraft({ heading: 0 })]), 34, [
      headingCommand("AC-1", 90_000, 0, 1),
    ]);
    const sequence = headings(outcomes);

    expect(sequence.slice(0, 4)).toEqual([3_000, 6_000, 9_000, 12_000]);
    expect(planeIn(tickAt(outcomes, 28), "AC-1").heading).toBe(87_000);
    expect(planeIn(tickAt(outcomes, 29), "AC-1").heading).toBe(90_000);
    // Held, not overshot: nothing moves an aircraft that is already on target.
    expect(sequence.slice(29)).toEqual([90_000, 90_000, 90_000, 90_000, 90_000]);
    expectTurnRateRespected(0, sequence);
  });

  it("turns the shorter way when that means decreasing through zero", () => {
    // shortestTurn(10_000, 350_000) = -20_000: counter-clockwise, six full steps
    // of 3_000 plus a final 2_000 snap.
    const outcomes = runWithFirstBatch(stateOver([aircraft({ heading: 10_000 })]), 10, [
      headingCommand("AC-1", 350_000, 0, 1),
    ]);
    const sequence = headings(outcomes);

    // Decreasing, so the first commanded tick is 7_000 — never 13_000, which is
    // what turning the long way round would produce.
    expect(planeIn(tickAt(outcomes, 0), "AC-1").heading).toBe(7_000);
    expect(sequence.slice(0, 7)).toEqual([7_000, 4_000, 1_000, 358_000, 355_000, 352_000, 350_000]);
    expect(planeIn(tickAt(outcomes, 6), "AC-1").heading).toBe(350_000);
    expect(sequence.slice(6)).toEqual([350_000, 350_000, 350_000, 350_000]);
    expectTurnRateRespected(10_000, sequence);
  });

  it("wraps through zero the other way and keeps every heading in range", () => {
    // shortestTurn(350_000, 10_000) = +20_000: clockwise across the wrap point.
    const outcomes = runWithFirstBatch(stateOver([aircraft({ heading: 350_000 })]), 10, [
      headingCommand("AC-1", 10_000, 0, 1),
    ]);
    const sequence = headings(outcomes);

    // The fourth tick is the one that crosses: 359_000 + 3_000 is reported as
    // 2_000, not 362_000 — the contract's range is `[0, 360000)`.
    expect(planeIn(tickAt(outcomes, 3), "AC-1").heading).toBe(2_000);
    expect(sequence.slice(0, 7)).toEqual([353_000, 356_000, 359_000, 2_000, 5_000, 8_000, 10_000]);
    for (const heading of sequence) {
      expect(heading).toBeGreaterThanOrEqual(0);
      expect(heading).toBeLessThan(360_000);
    }
    expectTurnRateRespected(350_000, sequence);
  });

  it("breaks an exact half-turn clockwise, per the declared tie-break", () => {
    // Both directions are 180_000 away, so without a tie-break the engine would
    // not be a function here. The rule says clockwise: increasing.
    const outcomes = runWithFirstBatch(stateOver([aircraft({ heading: 0 })]), 62, [
      headingCommand("AC-1", 180_000, 0, 1),
    ]);
    const sequence = headings(outcomes);

    expect(planeIn(tickAt(outcomes, 0), "AC-1").heading).toBe(3_000);
    expect(planeIn(tickAt(outcomes, 58), "AC-1").heading).toBe(177_000);
    expect(planeIn(tickAt(outcomes, 59), "AC-1").heading).toBe(180_000);
    expect(sequence.slice(59)).toEqual([180_000, 180_000, 180_000]);
    expectTurnRateRespected(0, sequence);
  });

  it("snaps exactly onto a target that is not a multiple of maxTurnRate", () => {
    const outcomes = runWithFirstBatch(stateOver([aircraft({ heading: 0 })]), 6, [
      headingCommand("AC-1", 10_000, 0, 1),
    ]);

    // The last step is 1_000, not another full 3_000 followed by a correction.
    expect(headings(outcomes)).toEqual([3_000, 6_000, 9_000, 10_000, 10_000, 10_000]);
    expectTurnRateRespected(0, headings(outcomes));
  });

  // A `maxTurnRate` of 0 is contract-legal (core only requires rates >= 0) and
  // means exactly what it says: this aircraft cannot turn. Holding an
  // unreachable heading target forever is the correct behaviour, not a stall —
  // contrast with the climb/descent rates below, which are genuinely fixable.
  it("holds an unreachable heading target forever when maxTurnRate is 0, without error", () => {
    const outcomes = runWithFirstBatch(
      stateOver([aircraft({ heading: 0, limits: { maxTurnRate: 0 } })]),
      5,
      [headingCommand("AC-1", 90_000, 0, 1)],
    );

    expect(headings(outcomes)).toEqual([0, 0, 0, 0, 0]);
    expect(reachedIndices(outcomes, "heading", "AC-1")).toEqual([]);
  });

  // --- Altitude --------------------------------------------------------------

  it("climbs at the climb bound and holds on arrival", () => {
    // 10_000 mm at 2_000 mm/tick = 5 ticks.
    const outcomes = runWithFirstBatch(stateOver([aircraft({ position: { z: 1_000_000 } })]), 8, [
      altitudeCommand("AC-1", 1_010_000, 0, 1),
    ]);

    expect(altitudes(outcomes)).toEqual([
      1_002_000, 1_004_000, 1_006_000, 1_008_000, 1_010_000, 1_010_000, 1_010_000, 1_010_000,
    ]);
    expect(planeIn(tickAt(outcomes, 4), "AC-1").position.z).toBe(1_010_000);
    expectAltitudeRateRespected(1_000_000, altitudes(outcomes));
  });

  it("descends at the descent bound, reaches ground exactly, and never goes negative", () => {
    // 12_000 mm at 3_000 mm/tick = 4 ticks, landing exactly on 0.
    const outcomes = runWithFirstBatch(stateOver([aircraft({ position: { z: 12_000 } })]), 8, [
      altitudeCommand("AC-1", 0, 0, 1),
    ]);
    const sequence = altitudes(outcomes);

    expect(sequence).toEqual([9_000, 6_000, 3_000, 0, 0, 0, 0, 0]);
    expect(planeIn(tickAt(outcomes, 3), "AC-1").position.z).toBe(0);
    for (const z of sequence) {
      expect(z).toBeGreaterThanOrEqual(0);
    }
    expectAltitudeRateRespected(12_000, sequence);
  });

  // A climb/descent rate under 10 mm/s is less than 1 mm per 100 ms tick.
  // `perTickMm` used to round such a rate to a per-tick bound of 0 on every
  // tick, so an admitted target stalled forever with no event ever reported.
  // The fix (ruleset.ts's tick-keyed budget schedule) grants 1 mm on every
  // 10th/(rate)-th tick instead, so the long-run rate is exactly the declared
  // one and the target is still reached.
  it("climbs at a rate that used to quantize to a zero per-tick bound", () => {
    const outcomes = runWithFirstBatch(
      stateOver([aircraft({ position: { z: 1_000_000 }, limits: { maxClimbRate: 5 } })]),
      4,
      [altitudeCommand("AC-1", 1_000_001, 0, 1)],
    );

    // Old rule: perTickMm(5) === 0 on every tick, so this sequence would have
    // been [1_000_000, 1_000_000, 1_000_000, 1_000_000] forever.
    expect(altitudes(outcomes)).toEqual([1_000_000, 1_000_001, 1_000_001, 1_000_001]);
    expect(reachedIndices(outcomes, "altitude", "AC-1")).toEqual([1]);
  });

  it("descends at a rate that used to quantize to a zero per-tick bound", () => {
    const outcomes = runWithFirstBatch(
      stateOver([aircraft({ position: { z: 1_000_010 }, limits: { maxDescentRate: 3 } })]),
      6,
      [altitudeCommand("AC-1", 1_000_009, 0, 1)],
    );

    expect(altitudes(outcomes)).toEqual([
      1_000_010, 1_000_010, 1_000_010, 1_000_009, 1_000_009, 1_000_009,
    ]);
    expect(reachedIndices(outcomes, "altitude", "AC-1")).toEqual([3]);
  });

  // --- Speed (research R4) ---------------------------------------------------

  it("applies an assigned speed in full at its effective tick", () => {
    const outcomes = runWithFirstBatch(stateOver([aircraft({ speed: 100_000 })]), 4, [
      speedCommand("AC-1", 200_000, 0, 1),
    ]);

    // One step, no ramp: ruleset v1 declares no acceleration limit.
    expect(speeds(outcomes)).toEqual([200_000, 200_000, 200_000, 200_000]);
    expectSpeedWithinLimits(outcomes);
  });

  it("accepts an assignment of exactly minSpeed", () => {
    const outcomes = runWithFirstBatch(stateOver([aircraft({ speed: 100_000 })]), 3, [
      speedCommand("AC-1", DEFAULT_LIMITS.minSpeed, 0, 1),
    ]);

    expect(tickAt(outcomes, 0).rejected).toEqual([]);
    expect(speeds(outcomes)).toEqual([50_000, 50_000, 50_000]);
    expectSpeedWithinLimits(outcomes);
  });

  it("accepts an assignment of exactly maxSpeed", () => {
    const outcomes = runWithFirstBatch(stateOver([aircraft({ speed: 100_000 })]), 3, [
      speedCommand("AC-1", DEFAULT_LIMITS.maxSpeed, 0, 1),
    ]);

    expect(tickAt(outcomes, 0).rejected).toEqual([]);
    expect(speeds(outcomes)).toEqual([300_000, 300_000, 300_000]);
    expectSpeedWithinLimits(outcomes);
  });

  // --- Effective time (FR-006, research R5) ----------------------------------

  it("leaves motion untouched until a future command's effective tick", () => {
    // Submitted on the call that produces tick 1, effective at tick 4.
    const command = headingCommand("AC-1", 90_000, 0, 4);
    const commanded = runWithFirstBatch(stateOver([aircraft()]), 5, [command]);
    const untouched = run(stateOver([aircraft()]), 5);

    // Whole-aircraft comparison: a premature effect on *any* dimension shows up.
    for (const index of [0, 1, 2]) {
      expect(planeIn(tickAt(commanded, index), "AC-1")).toEqual(
        planeIn(tickAt(untouched, index), "AC-1"),
      );
      expect(tickAt(commanded, index).applied).toEqual([]);
    }

    expect(tickAt(commanded, 3).applied).toEqual([command]);
    expect(planeIn(tickAt(commanded, 3), "AC-1").heading).toBe(3_000);
  });

  // --- Composition -----------------------------------------------------------

  it("applies commands of different kinds at the same tick together", () => {
    const heading = headingCommand("AC-1", 90_000, 0, 1);
    const altitude = altitudeCommand("AC-1", 1_010_000, 0, 1);
    const speed = speedCommand("AC-1", 200_000, 0, 1);
    const outcomes = runWithFirstBatch(stateOver([aircraft()]), 2, [heading, altitude, speed]);
    const first = tickAt(outcomes, 0);

    // Different kinds never collide, so nothing is displaced.
    expect(first.applied).toEqual([heading, altitude, speed]);
    expect(first.superseded).toEqual([]);
    expect(first.rejected).toEqual([]);

    const plane = planeIn(first, "AC-1");
    expect(plane.heading).toBe(3_000);
    expect(plane.position.z).toBe(1_002_000);
    expect(plane.speed).toBe(200_000);
  });
});

// --- T014: supersession and arrival reporting --------------------------------

describe("advanceTick resolves duplicate assignments and reports reaching a target", () => {
  // --- Supersession (research R6) --------------------------------------------

  it("lets the later of two same-tick assignments win, and reports the displaced one", () => {
    const first = headingCommand("AC-1", 90_000, 0, 1);
    const second = headingCommand("AC-1", 350_000, 0, 1);
    const outcomes = runWithFirstBatch(stateOver([aircraft({ heading: 10_000 })]), 2, [
      first,
      second,
    ]);
    const tick = tickAt(outcomes, 0);

    // 7_000 is the counter-clockwise step toward 350_000; turning toward 90_000
    // would read 13_000 instead, so the heading alone identifies the winner.
    expect(planeIn(tick, "AC-1").heading).toBe(7_000);
    expect(tick.superseded).toEqual([{ superseded: first, by: second }]);
    expect(tick.applied).toEqual([second]);
    expect(tick.rejected).toEqual([]);
  });

  it("does not supersede two assignments with different effective ticks", () => {
    const early = headingCommand("AC-1", 90_000, 0, 1);
    const late = headingCommand("AC-1", 10_000, 0, 3);
    const outcomes = runWithFirstBatch(stateOver([aircraft({ heading: 0 })]), 5, [early, late]);

    // Both are admitted; the second simply replaces the target on its own tick.
    expect(tickAt(outcomes, 0).superseded).toEqual([]);
    expect(tickAt(outcomes, 0).applied).toEqual([early]);
    expect(headings(outcomes).slice(0, 2)).toEqual([3_000, 6_000]);

    expect(tickAt(outcomes, 2).applied).toEqual([late]);
    expect(tickAt(outcomes, 2).superseded).toEqual([]);
    // Now converging on 10_000 from 6_000: 9_000, then the 1_000 snap.
    expect(headings(outcomes).slice(2)).toEqual([9_000, 10_000, 10_000]);
  });

  it("does not supersede commands of different kinds at the same tick", () => {
    const heading = headingCommand("AC-1", 90_000, 0, 1);
    const speed = speedCommand("AC-1", 200_000, 0, 1);
    const outcomes = runWithFirstBatch(stateOver([aircraft()]), 2, [heading, speed]);

    expect(tickAt(outcomes, 0).superseded).toEqual([]);
    expect(tickAt(outcomes, 0).applied).toEqual([heading, speed]);
  });

  it("supersedes a queued command when a later one arrives on a subsequent call", () => {
    // Both effective at tick 3, but submitted on different calls: the queued
    // proposal is displaced on the tick the replacement is admitted, not on the
    // tick either of them would have taken effect.
    const queued = headingCommand("AC-1", 90_000, 0, 3);
    const replacement = headingCommand("AC-1", 10_000, 1, 3);
    const outcomes = run(
      stateOver([aircraft({ heading: 0 })]),
      5,
      new Map([
        [0, [queued]],
        [1, [replacement]],
      ]),
    );

    expect(tickAt(outcomes, 0).superseded).toEqual([]);
    expect(tickAt(outcomes, 1).superseded).toEqual([{ superseded: queued, by: replacement }]);
    expect(tickAt(outcomes, 2).applied).toEqual([replacement]);
    // Converging on 10_000, not on 90_000: 3_000, 6_000, 9_000, 10_000.
    expect(headings(outcomes)).toEqual([0, 0, 3_000, 6_000, 9_000]);
  });

  // --- targetReached ---------------------------------------------------------

  it("reports reaching a heading target exactly once, on the arrival tick", () => {
    const outcomes = runWithFirstBatch(stateOver([aircraft({ heading: 0 })]), 8, [
      headingCommand("AC-1", 10_000, 0, 1),
    ]);

    // Counted across the whole run: holding the target is not a re-arrival.
    expect(reachedIndices(outcomes, "heading", "AC-1")).toEqual([3]);

    const arrival = tickAt(outcomes, 3);
    expect(arrival.events).toContainEqual({
      kind: "targetReached",
      aircraftId: "AC-1",
      tick: arrival.state.snapshot.simTime,
      dimension: "heading",
    });
  });

  it("reports reaching an altitude target exactly once, on the arrival tick", () => {
    const outcomes = runWithFirstBatch(stateOver([aircraft({ position: { z: 1_000_000 } })]), 8, [
      altitudeCommand("AC-1", 1_010_000, 0, 1),
    ]);

    expect(reachedIndices(outcomes, "altitude", "AC-1")).toEqual([4]);

    const arrival = tickAt(outcomes, 4);
    expect(arrival.events).toContainEqual({
      kind: "targetReached",
      aircraftId: "AC-1",
      tick: arrival.state.snapshot.simTime,
      dimension: "altitude",
    });
  });

  it("reports reaching a speed target on the effective tick, since speed arrives at once", () => {
    const outcomes = runWithFirstBatch(stateOver([aircraft({ speed: 100_000 })]), 5, [
      speedCommand("AC-1", 200_000, 0, 1),
    ]);

    expect(reachedIndices(outcomes, "speed", "AC-1")).toEqual([0]);

    const arrival = tickAt(outcomes, 0);
    expect(arrival.events).toContainEqual({
      kind: "targetReached",
      aircraftId: "AC-1",
      tick: arrival.state.snapshot.simTime,
      dimension: "speed",
    });
  });
});
