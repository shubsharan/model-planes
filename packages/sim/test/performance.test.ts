// T020: the throughput budget of `advanceTick` (spec SC-005; research R9).
//
// SC-005: "a benchmark author can advance a 50-aircraft world through one hour
// of simulated time in under one minute of real time on commodity hardware."
// One tick is `MS_PER_TICK` (100 ms) of simulated time, so one simulated hour is
// 3_600_000 / 100 = 36_000 ticks. This suite runs exactly that: 50 aircraft,
// 36_000 ticks — but, unlike a dead-reckoning-only run, with a deterministic
// command schedule (see below) so the budget also covers the path a real
// controller exercises: admission, the pending queue, supersession, rejection,
// and target convergence, not only the motion arithmetic.
//
// The assertion budget is 10 s, not the 60 s of the spec. R9 sets it there on
// purpose: a test that only failed at 60 s would leave no room to notice a
// regression before it broke the stated guarantee, and a machine slower than the
// one this was written on still has headroom before the spec bound is at
// risk. A failure here is therefore an early warning, not yet an SC-005 breach —
// but the measured number is printed in the failure message so the reader can
// tell which of the two they are looking at.
//
// On clock reads: `Date.now()` and `performance.now()` are forbidden inside
// `packages/sim/src` — the engine is a pure function of (state, commands) and a
// clock read there would make a replay non-reproducible. The read below is in
// the *test harness*, wrapping the loop from the outside. Nothing measured here
// flows into engine state, so the determinism guarantee is untouched.
//
// This suite calls `advanceTick` directly rather than through
// `test/harness.ts`'s `advance` — the SC-005 budget must measure the engine,
// not the displacement invariant every other suite checks on top of it.
import { describe, expect, it } from "vitest";
import { MS_PER_TICK, type AircraftState, parseWorldSnapshot } from "@model-planes/core";
import { createWorldEngineState } from "../src/world-engine-state.ts";
import { advanceTick } from "../src/world-engine.ts";
import { type MotionCommand, aircraft, headingCommand, snapshot } from "./fixtures.ts";

// --- Run shape ---------------------------------------------------------------

/** One simulated hour, in ticks: 3_600_000 ms / 100 ms per tick. */
const TICKS = 3_600_000 / MS_PER_TICK;

/** Fleet size named by SC-005. */
const FLEET_SIZE = 50;

/** R9's test budget, in wall-clock ms. Deliberately well under the spec's 60 s. */
const BUDGET_MS = 10_000;

/**
 * Cruise speed for the run, in mm/s — the fixture's `minSpeed`. At 50_000 mm/s
 * a tick advances `round(50_000 * 100 / 1000) = 5_000` mm.
 */
const CRUISE_MM_PER_SEC = 50_000;

/** Eight compass headings in millidegrees, cycled across the fleet. */
const HEADINGS = [0, 45_000, 90_000, 135_000, 180_000, 225_000, 270_000, 315_000] as const;

/** Per-aircraft position stagger, in mm, so no two aircraft share a point. */
const STAGGER_MM = 1_000;

/**
 * A fleet of `count` aircraft, staggered near the origin. Their headings are
 * assigned turns by `schedule` below rather than being fixed for the whole
 * run, so — unlike a pure-dead-reckoning fleet — they don't need to be placed
 * upwind of a boundary to stay in bounds; see `schedule`'s docstring for why
 * they can't ever reach it.
 */
function fleet(count: number): readonly AircraftState[] {
  const built: AircraftState[] = [];
  for (let i = 0; i < count; i++) {
    built.push(
      aircraft({
        id: `AC-${i + 1}`,
        heading: HEADINGS[i % HEADINGS.length] ?? 0,
        speed: CRUISE_MM_PER_SEC,
        // `-i * STAGGER_MM` would be `-0` at `i === 0`, which the contract
        // rejects as a non-canonical integer (ADR 0001) — offset `y` instead
        // of negating it, so every position stays a plain positive integer.
        position: { x: i * STAGGER_MM, y: i * STAGGER_MM + STAGGER_MM, z: 1_000_000 },
      }),
    );
  }
  return built;
}

// --- Command schedule ---------------------------------------------------------

/** Ticks between heading assignments — one simulated minute. */
const TURN_PERIOD = 600;

/** Lead time, in ticks, between admission and effect — exercises the pending queue. */
const LEAD_TICKS = 100;

/**
 * A turn small enough to complete in `TURN_STEP_MILLIDEG / maxTurnRate` = 15
 * ticks (the fixture's `maxTurnRate` is 3_000 millideg/tick), so between turns
 * each aircraft cruises in a straight line for the rest of the 600-tick period.
 * At 5_000 mm/tick that straight run is a 3_000_000 mm side, and eight turns of
 * 45_000 millideg close the path into a regular octagon whose circumscribed
 * radius is `side / (2 tan(22.5°))` ≈ 3_621_320 mm — about 3.6% of the
 * ±100_000_000 mm airspace half-width. Every aircraft is provably bounded near
 * its start point for the whole run, with enormous margin, so no aircraft
 * exits and freezes — which would silently turn part of the run into a no-op.
 */
const TURN_STEP_MILLIDEG = 45_000;

/** A submission this schedule always includes and always expects rejected. */
const UNKNOWN_TARGET_ID = "AC-NOPE";

/**
 * The tick-indexed command schedule: a batch of heading turns issued every
 * `TURN_PERIOD` ticks, effective `LEAD_TICKS` later. Built entirely up front —
 * a pure function of `(fleetSize, ticks)`, no RNG, no clock — so two runs
 * produce byte-identical command streams and the measured loop below does no
 * allocation of its own beyond what `advanceTick` already does per tick.
 *
 * Every batch also includes:
 *   - a duplicate heading command for every third aircraft, at the same
 *     `effectiveAt` as its real turn, so the fold must supersede one
 *     (research R6) — exercised, not just idle;
 *   - one command targeting `AC-NOPE`, which does not exist, so admission
 *     rejects it every time (research R7).
 *
 * Returned as an array indexed by call number (0 is the call that produces
 * tick 1), sharing one frozen empty array on every tick with no batch, so the
 * 36_000-entry schedule costs as many real arrays as there are batches, not
 * one per tick.
 */
function buildSchedule(fleetSize: number, ticks: number): readonly (readonly MotionCommand[])[] {
  const NO_COMMANDS: readonly MotionCommand[] = [];
  const byCall: (readonly MotionCommand[])[] = Array.from({ length: ticks }, () => NO_COMMANDS);

  let turnsIssued = 0;
  for (let issueAt = 0; issueAt + LEAD_TICKS < ticks; issueAt += TURN_PERIOD) {
    turnsIssued += 1;
    const effectiveAt = issueAt + 1 + LEAD_TICKS;
    const batch: MotionCommand[] = [];

    for (let i = 0; i < fleetSize; i++) {
      const id = `AC-${i + 1}`;
      const baseHeading = HEADINGS[i % HEADINGS.length] ?? 0;
      const target = (baseHeading + TURN_STEP_MILLIDEG * turnsIssued) % 360_000;

      if (i % 3 === 0) {
        // Submitted first, same (kind, target, effectiveAt): displaced by the
        // real turn below when the fold runs (research R6).
        batch.push(headingCommand(id, (target + 90_000) % 360_000, issueAt, effectiveAt));
      }
      batch.push(headingCommand(id, target, issueAt, effectiveAt));
    }
    batch.push(headingCommand(UNKNOWN_TARGET_ID, 0, issueAt, effectiveAt));

    byCall[issueAt] = batch;
  }
  return byCall;
}

/** How many batches `buildSchedule` issues over `ticks` calls. */
function batchCount(ticks: number): number {
  return Math.floor((ticks - LEAD_TICKS - 1) / TURN_PERIOD) + 1;
}

// --- Throughput (SC-005) -----------------------------------------------------

describe("advanceTick sustains a 50-aircraft world for an hour of simulated time", () => {
  it("advances 36_000 ticks of commanded flight within the benchmark budget", () => {
    const initial = createWorldEngineState(snapshot({ aircraft: fleet(FLEET_SIZE) }));
    if (!initial.ok) {
      throw new Error(
        `test invariant: fixture snapshot is contract-invalid: ${initial.error.message}`,
      );
    }
    const startTick = initial.value.snapshot.simTime;
    const schedule = buildSchedule(FLEET_SIZE, TICKS);

    let state = initial.value;
    let applied = 0;
    let rejected = 0;
    let superseded = 0;

    // The clock reads bracket the loop from outside the engine; see the file
    // header. Nothing between them consults a clock.
    const startedAt = performance.now();
    for (let i = 0; i < TICKS; i++) {
      const outcome = advanceTick(state, schedule[i] ?? []);
      if (!outcome.ok) {
        throw new Error(`advanceTick errored on tick ${i}: ${outcome.error.message}`);
      }
      applied += outcome.value.applied.length;
      rejected += outcome.value.rejected.length;
      superseded += outcome.value.superseded.length;
      state = outcome.value.state;
    }
    const elapsedMs = performance.now() - startedAt;

    // Correctness first: a budget met by a loop that silently did nothing, or
    // whose schedule quietly stopped producing commands, would be worthless
    // evidence for SC-005.
    expect(state.snapshot.simTime).toBe(startTick + TICKS);
    expect(state.snapshot.aircraft).toHaveLength(FLEET_SIZE);
    expect(parseWorldSnapshot(state.snapshot).ok).toBe(true);

    const batches = batchCount(TICKS);
    expect(applied, "every batch must apply one heading command per aircraft").toBe(
      batches * FLEET_SIZE,
    );
    expect(superseded, "every batch's duplicated third must be superseded").toBe(
      batches * Math.ceil(FLEET_SIZE / 3),
    );
    expect(rejected, "every batch's unknown-target command must be rejected").toBe(batches);
    // No aircraft ever left the airspace: a freeze would have turned the rest
    // of that aircraft's run into dead weight the budget doesn't actually pay
    // for, understating the real cost of a full hour of commanded flight.
    expect(state.exited.size, "no aircraft should have exited the airspace").toBe(0);

    // The measured number rides along in the failure message so a future
    // reader sees the actual margin, not just "too slow".
    expect(
      elapsedMs,
      `${FLEET_SIZE} aircraft x ${TICKS} ticks (${batches} command batches) took ` +
        `${elapsedMs.toFixed(0)} ms (R9 budget ${BUDGET_MS} ms, SC-005 bound 60000 ms)`,
    ).toBeLessThan(BUDGET_MS);
  }, // Generous per-test timeout: on a slow machine this should report a budget
  // assertion failure carrying the measured time, not an opaque test timeout.
  60_000);
});
