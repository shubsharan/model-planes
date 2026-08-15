// T010: the boundary and resource events of `advanceTick` (spec FR-008 fuel
// window, FR-009 airspace boundary, FR-010 never-silent event reporting;
// research R8).
//
// Two rules are pinned down here, and both are about *transitions*, not states:
//
//   - `fuelExhausted` fires on the single tick where `fuelOrWindowRemaining`
//     goes from positive to 0. Never earlier, never again, and never at all for
//     an aircraft that was already at 0 at construction — there is no
//     transition to report, even though `state.exhausted` already carries it
//     (seeded at construction; see `world-engine-state.test.ts`). The flag is
//     permanent once set, but the event is not repeated, so every assertion
//     below counts occurrences across a whole run rather than looking at one
//     tick in isolation.
//   - `airspaceExited` fires on the single tick where motion would leave the
//     declared bound. The position is clamped to the boundary and the aircraft
//     is frozen from then on. Freezing is a *motion* rule: fuel keeps ticking
//     down for a frozen aircraft, which is what the last boundary case proves.
//
// The clamp is not cosmetic. `parseWorldSnapshot` rejects any position outside
// `±AIRSPACE_BOUND_MM`, so re-validating every produced snapshot (as every case
// below does) is the evidence that no out-of-bounds state is ever *reported* —
// not merely that it is flagged.
//
// The fuel fixtures below are expressed in terms of `FUEL_DECREMENT_PER_TICK`
// (aliased `D`) rather than hardcoding "1": the previous fixed literals made
// every test here pass by construction even if the engine's floor at zero
// only happened to work for a decrement of exactly 1 (see `ruleset.ts`'s
// `nextFuel` and its regression test in `test/ruleset.test.ts`).
//
// `targetReached` is deliberately absent: convergence events belong to T014.
import { describe, expect, it } from "vitest";
import { AIRSPACE_BOUND_MM, parseWorldSnapshot } from "@model-planes/core";
import { FUEL_DECREMENT_PER_TICK as D } from "../src/ruleset.ts";
import { DEFAULT_FUEL, aircraft } from "./fixtures.ts";
import { type TickOutcome, planeIn, run, stateOver } from "./harness.ts";

// --- Local helpers -----------------------------------------------------------

/**
 * Dead-reckoning step of the fixture default aircraft, in mm per tick.
 *
 * Speed 100_000 mm/s ⇒ `distanceScaled = 100_000 * 100 = 10_000_000`, and with
 * `cos(0) === 1` exactly, `dx = round(10_000_000 / 1000) = 10_000`. Spelled out
 * as a constant so a boundary setup reads as "half a step short of the bound".
 */
const STEP_MM = 10_000;

/** Ticks each run advances — comfortably past every transition under test. */
const RUN_TICKS = 6;

/** Indices of the outcomes carrying an event of `kind` for `id`. */
function tickIndicesWithEvent(
  outcomes: readonly TickOutcome[],
  kind: "airspaceExited" | "fuelExhausted",
  id: string,
): readonly number[] {
  return outcomes.flatMap((outcome, index) =>
    outcome.events.some((event) => event.kind === kind && event.aircraftId === id) ? [index] : [],
  );
}

/** Asserts every snapshot in a run is still accepted by the core contract. */
function expectAllSnapshotsValid(outcomes: readonly TickOutcome[]): void {
  for (const outcome of outcomes) {
    expect(parseWorldSnapshot(outcome.state.snapshot).ok).toBe(true);
  }
}

// --- Fuel window (FR-008) ----------------------------------------------------

describe("advanceTick reports the fuel-or-time window reaching zero", () => {
  it("decrements by the declared amount each tick and floors at zero", () => {
    // Starting at `2D + 1` makes the last real step a PARTIAL one — the case a
    // literal `fuelBefore - D` would get wrong for any D > 1, since `1 - D`
    // would go negative instead of flooring.
    const outcomes = run(stateOver([aircraft({ fuelOrWindowRemaining: 2 * D + 1 })]), RUN_TICKS);
    const fuel = outcomes.map((outcome) => planeIn(outcome, "AC-1").fuelOrWindowRemaining);

    expect(fuel[0]).toBe(2 * D + 1 - D);
    expect(fuel[1]).toBe(1);
    expect(fuel.slice(2)).toEqual([0, 0, 0, 0]);
    for (const value of fuel) expect(value).toBeGreaterThanOrEqual(0);
    expectAllSnapshotsValid(outcomes);
  });

  it("raises fuelExhausted exactly once, on the tick the window becomes zero", () => {
    const outcomes = run(stateOver([aircraft({ fuelOrWindowRemaining: 2 * D + 1 })]), RUN_TICKS);

    // Counted across the whole run: the event is a positive→0 transition
    // report, so a second occurrence on any later tick is as wrong as an early
    // one. The crossing tick is the partial step (1 → 0), not a clean multiple
    // of D.
    expect(tickIndicesWithEvent(outcomes, "fuelExhausted", "AC-1")).toEqual([2]);

    const exhaustionTick = outcomes[2];
    if (exhaustionTick === undefined) throw new Error("test invariant: run too short");
    expect(exhaustionTick.events).toContainEqual({
      kind: "fuelExhausted",
      aircraftId: "AC-1",
      tick: exhaustionTick.state.snapshot.simTime,
    });
  });

  it("flags the aircraft as exhausted from that tick onward, permanently", () => {
    const outcomes = run(stateOver([aircraft({ fuelOrWindowRemaining: 2 * D + 1 })]), RUN_TICKS);

    expect(outcomes.map((outcome) => outcome.state.exhausted.has("AC-1"))).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
  });

  it("keeps an exhausted aircraft flying — the flag is not a freeze", () => {
    const outcomes = run(stateOver([aircraft({ fuelOrWindowRemaining: 2 * D + 1 })]), RUN_TICKS);

    // Dead reckoning is untouched by exhaustion: tick n still sits at n steps.
    expect(outcomes.map((outcome) => planeIn(outcome, "AC-1").position.x)).toEqual(
      [1, 2, 3, 4, 5, 6].map((tick) => tick * STEP_MM),
    );
    expect(outcomes.some((outcome) => outcome.state.exited.has("AC-1"))).toBe(false);
  });

  it("never raises the event for an aircraft that started at zero, though the flag is seeded", () => {
    const outcomes = run(stateOver([aircraft({ fuelOrWindowRemaining: 0 })]), RUN_TICKS);

    // No transition ever happens, so there is nothing to report — but the flag
    // is already true from the first outcome, seeded at construction, not by a
    // transition this run produced.
    expect(tickIndicesWithEvent(outcomes, "fuelExhausted", "AC-1")).toEqual([]);
    expect(outcomes.every((outcome) => outcome.state.exhausted.has("AC-1"))).toBe(true);
    expect(outcomes.map((outcome) => planeIn(outcome, "AC-1").fuelOrWindowRemaining)).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
    expectAllSnapshotsValid(outcomes);
  });
});

// --- Airspace boundary (FR-009) ---------------------------------------------

describe("advanceTick clamps, flags, and freezes an aircraft leaving the airspace", () => {
  /** Half a step short of the +x bound: the first tick would overshoot by 5_000. */
  const nearPositiveX = aircraft({
    heading: 0,
    speed: 100_000,
    position: { x: AIRSPACE_BOUND_MM - 5_000, y: 0, z: 1_000_000 },
  });

  it("clamps x exactly to the bound and leaves y and z alone", () => {
    const outcomes = run(stateOver([nearPositiveX]), RUN_TICKS);

    const first = outcomes[0];
    if (first === undefined) throw new Error("test invariant: run too short");
    // The raw step lands on AIRSPACE_BOUND_MM + 5_000; the reported position is
    // the boundary point itself, never the overshoot.
    expect(planeIn(first, "AC-1").position.x).toBe(AIRSPACE_BOUND_MM);
    expect(planeIn(first, "AC-1").position.y).toBe(0);
    expect(planeIn(first, "AC-1").position.z).toBe(1_000_000);
  });

  it("raises airspaceExited exactly once, on the crossing tick", () => {
    const outcomes = run(stateOver([nearPositiveX]), RUN_TICKS);

    expect(tickIndicesWithEvent(outcomes, "airspaceExited", "AC-1")).toEqual([0]);

    const crossing = outcomes[0];
    if (crossing === undefined) throw new Error("test invariant: run too short");
    expect(crossing.events).toContainEqual({
      kind: "airspaceExited",
      aircraftId: "AC-1",
      tick: crossing.state.snapshot.simTime,
    });
  });

  it("keeps exact boundary contact in bounds until a later step would cross", () => {
    const touching = aircraft({
      heading: 0,
      speed: 100_000,
      position: { x: AIRSPACE_BOUND_MM - STEP_MM, y: 0, z: 1_000_000 },
    });
    const outcomes = run(stateOver([touching]), 2);
    const contact = outcomes[0];
    if (contact === undefined) throw new Error("test invariant: run too short");

    expect(planeIn(contact, "AC-1").position.x).toBe(AIRSPACE_BOUND_MM);
    expect(tickIndicesWithEvent(outcomes, "airspaceExited", "AC-1")).toEqual([1]);
    expect(outcomes.map((outcome) => outcome.state.exited.has("AC-1"))).toEqual([false, true]);
  });

  it("allows an aircraft on the boundary to move inward without an exit", () => {
    const inward = aircraft({
      heading: 180_000,
      speed: 100_000,
      position: { x: AIRSPACE_BOUND_MM, y: 0, z: 1_000_000 },
    });
    const outcomes = run(stateOver([inward]), 1);
    const moved = outcomes[0];
    if (moved === undefined) throw new Error("test invariant: run too short");

    expect(planeIn(moved, "AC-1").position.x).toBe(AIRSPACE_BOUND_MM - STEP_MM);
    expect(tickIndicesWithEvent(outcomes, "airspaceExited", "AC-1")).toEqual([]);
    expect(moved.state.exited.has("AC-1")).toBe(false);
  });

  it("flags the aircraft as exited from the crossing tick onward", () => {
    const outcomes = run(stateOver([nearPositiveX]), RUN_TICKS);

    expect(outcomes.map((outcome) => outcome.state.exited.has("AC-1"))).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it("freezes position after the clamp while fuel keeps decrementing", () => {
    const outcomes = run(stateOver([nearPositiveX]), RUN_TICKS);

    // Frozen means *identical*, not "close": no residual drift of a single mm.
    const clamped = { x: AIRSPACE_BOUND_MM, y: 0, z: 1_000_000 };
    for (const outcome of outcomes) {
      expect(planeIn(outcome, "AC-1").position).toEqual(clamped);
    }

    // The freeze is a motion rule, not a resource rule — the window still runs.
    const fuelPerTick = outcomes.map((outcome) => planeIn(outcome, "AC-1").fuelOrWindowRemaining);
    expect(fuelPerTick).toEqual([1, 2, 3, 4, 5, 6].map((tick) => DEFAULT_FUEL - tick * D));
  });

  it("keeps every reported snapshot contract-valid across the crossing", () => {
    // An unclamped position would be out of range, and this is what would fail.
    expectAllSnapshotsValid(run(stateOver([nearPositiveX]), RUN_TICKS));
  });

  it("clamps symmetrically at the negative x bound", () => {
    const westbound = aircraft({
      heading: 180_000,
      speed: 100_000,
      position: { x: -(AIRSPACE_BOUND_MM - 5_000), y: 0, z: 1_000_000 },
    });
    const outcomes = run(stateOver([westbound]), RUN_TICKS);

    expect(tickIndicesWithEvent(outcomes, "airspaceExited", "AC-1")).toEqual([0]);
    for (const outcome of outcomes) {
      expect(planeIn(outcome, "AC-1").position).toEqual({
        x: -AIRSPACE_BOUND_MM,
        y: 0,
        z: 1_000_000,
      });
    }
    expectAllSnapshotsValid(outcomes);
  });

  it("clamps on the y axis the same way it does on x", () => {
    const northbound = aircraft({
      heading: 90_000,
      speed: 100_000,
      position: { x: 0, y: AIRSPACE_BOUND_MM - 5_000, z: 1_000_000 },
    });
    const outcomes = run(stateOver([northbound]), RUN_TICKS);

    expect(tickIndicesWithEvent(outcomes, "airspaceExited", "AC-1")).toEqual([0]);
    for (const outcome of outcomes) {
      expect(planeIn(outcome, "AC-1").position).toEqual({
        x: 0,
        y: AIRSPACE_BOUND_MM,
        z: 1_000_000,
      });
    }
    expectAllSnapshotsValid(outcomes);
  });

  it("leaves an aircraft well inside the airspace unflagged and moving", () => {
    const outcomes = run(
      stateOver([aircraft({ position: { x: 0, y: 0, z: 1_000_000 } })]),
      RUN_TICKS,
    );

    expect(tickIndicesWithEvent(outcomes, "airspaceExited", "AC-1")).toEqual([]);
    expect(outcomes.some((outcome) => outcome.state.exited.has("AC-1"))).toBe(false);
    expect(outcomes.map((outcome) => planeIn(outcome, "AC-1").position.x)).toEqual(
      [1, 2, 3, 4, 5, 6].map((tick) => tick * STEP_MM),
    );
    expectAllSnapshotsValid(outcomes);
  });
});
