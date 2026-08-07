// T009: `advanceTick` is a deterministic, non-mutating function of its inputs.
//
// The oracle for every position assertion below is the declared motion rule
// (spec FR-004, `docs/features/0002-aircraft-world-engine/data-model.md`):
//
//   distanceScaled = speed * MS_PER_TICK                  // exact integer
//   dx = quantizeHalfToEven(distanceScaled * cos(heading) / 1000)
//   dy = quantizeHalfToEven(distanceScaled * sin(heading) / 1000)
//
// applied to the **post-steering** heading and speed — the values the outcome
// itself reports. It lives in `test/harness.ts` as `expectedDelta`, and is
// checked on every `advance` call in every suite, not only here and not only
// on the uncommanded ticks this file happens to run (a commanded turn bends
// the same tick's displacement — research R2; `motion.test.ts` anchors that
// case with hand-computed absolute positions, which this relational oracle
// cannot supply on its own).
//
// Note `dx` takes cos and `dy` takes sin: heading 0 is +x, heading 90000 is +y.
//
// The one-tick block hard-codes integers computed by hand rather than by calling
// the engine's own helpers, so the suite states what the answer is rather than
// restating how the engine gets there. Where a hand-computed constant would be
// unreadable (a general oblique heading), the expectation is composed from
// `expectedDelta` instead.
import { describe, expect, it } from "vitest";
import {
  AIRSPACE_BOUND_MM,
  type AircraftState,
  type WorldSnapshot,
  parseWorldSnapshot,
} from "@model-planes/core";
import { RULESET_VERSION } from "../src/ruleset.ts";
import { type MotionCommand, aircraft, deepFreeze, runway, snapshot } from "./fixtures.ts";
import { advance, expectedDelta, type TickOutcome, stateOf } from "./harness.ts";
import type { WorldEngineState } from "../src/world-engine-state.ts";

// --- Local helpers -----------------------------------------------------------

/** The sole aircraft of a snapshot; fails loudly if the fixture has none. */
function only(state: WorldEngineState): AircraftState {
  const found = state.snapshot.aircraft.at(0);
  if (found === undefined) {
    throw new Error("test invariant: expected at least one aircraft");
  }
  return found;
}

/** The aircraft with `id`; fails loudly rather than silently asserting nothing. */
function byId(state: WorldEngineState, id: string): AircraftState {
  const found = state.snapshot.aircraft.find((a) => a.id === id);
  if (found === undefined) {
    throw new Error(`test invariant: no aircraft ${id}`);
  }
  return found;
}

/** The plain fields of a `TickOutcome` — everything but the `Result` wrapper. */
function comparable(outcome: TickOutcome) {
  return {
    rulesetVersion: outcome.rulesetVersion,
    snapshot: outcome.state.snapshot,
    applied: outcome.applied,
    rejected: outcome.rejected,
    superseded: outcome.superseded,
    events: outcome.events,
  };
}

/** Advance `ticks` times from `initial`, keeping every intermediate outcome. */
function run(initial: WorldEngineState, ticks: number): ReturnType<typeof comparable>[] {
  const collected: ReturnType<typeof comparable>[] = [];
  let state = initial;
  for (let i = 0; i < ticks; i++) {
    const outcome = advance(state);
    collected.push(comparable(outcome));
    state = outcome.state;
  }
  return collected;
}

// --- Fixtures shared by the multi-tick blocks --------------------------------

/** Ticks advanced by the replay and contract blocks. */
const RUN_TICKS = 25;

/**
 * Six aircraft on assorted headings and speeds, plus a runway. Headings mix the
 * axis-aligned cases (where a component is exactly 0 or ±1) with obliques and a
 * heading whose components are both irrational-ish, so a run exercises every
 * branch of the octant reconstruction rather than only the easy quadrant points.
 */
function busyWorld(): WorldSnapshot {
  return snapshot({
    aircraft: [
      aircraft({ id: "AC-1", position: { x: 0, y: 0, z: 1_000_000 }, heading: 0, speed: 100_000 }),
      aircraft({
        id: "AC-2",
        position: { x: 10_000_000, y: 0, z: 2_000_000 },
        heading: 45_000,
        speed: 150_000,
      }),
      aircraft({
        id: "AC-3",
        position: { x: -10_000_000, y: 5_000_000, z: 3_000_000 },
        heading: 123_456,
        speed: 275_500,
      }),
      aircraft({
        id: "AC-4",
        position: { x: 20_000_000, y: -20_000_000, z: 500_000 },
        heading: 180_000,
        speed: 50_000,
      }),
      aircraft({
        id: "AC-5",
        position: { x: -30_000_000, y: 30_000_000, z: 4_000_000 },
        heading: 270_000,
        speed: 300_000,
      }),
      aircraft({
        id: "AC-6",
        position: { x: 40_000_000, y: 40_000_000, z: 1_500_000 },
        heading: 359_999,
        speed: 100_005,
      }),
    ],
    runways: [runway()],
  });
}

// --- (a) One tick of dead reckoning ------------------------------------------

describe("advanceTick moves one aircraft by the declared dead-reckoning step", () => {
  // speed 100000 mm/s ⇒ distanceScaled 10000000 ⇒ a full unit step is 10000 mm.
  function step(heading: number, speed = 100_000): AircraftState {
    const state = stateOf(
      snapshot({
        aircraft: [aircraft({ position: { x: 0, y: 0, z: 1_000_000 }, heading, speed })],
      }),
    );
    return only(advance(state).state);
  }

  it("moves due +x on heading 0", () => {
    expect(step(0).position).toEqual({ x: 10_000, y: 0, z: 1_000_000 });
  });

  it("moves due +y on heading 90000", () => {
    expect(step(90_000).position).toEqual({ x: 0, y: 10_000, z: 1_000_000 });
  });

  it("moves due -x on heading 180000", () => {
    expect(step(180_000).position).toEqual({ x: -10_000, y: 0, z: 1_000_000 });
  });

  it("moves due -y on heading 270000", () => {
    expect(step(270_000).position).toEqual({ x: 0, y: -10_000, z: 1_000_000 });
  });

  // 10000 * sin(45°) = 7071.0678..., which rounds down in both components. The
  // two are equal because the octant fold evaluates one polynomial for both.
  it("splits the step evenly on the oblique heading 45000", () => {
    expect(step(45_000).position).toEqual({ x: 7_071, y: 7_071, z: 1_000_000 });
  });

  it("leaves heading, speed, class, limits and separation untouched", () => {
    const before = aircraft({ heading: 45_000 });
    const after = only(advance(stateOf(snapshot({ aircraft: [before] }))).state);

    expect(after.heading).toBe(before.heading);
    expect(after.speed).toBe(before.speed);
    expect(after.class).toBe(before.class);
    expect(after.limits).toEqual(before.limits);
    expect(after.separationRequirement).toEqual(before.separationRequirement);
  });

  it("burns exactly one unit of the fuel-or-time window", () => {
    const before = aircraft({ fuelOrWindowRemaining: 12 });
    const after = only(advance(stateOf(snapshot({ aircraft: [before] }))).state);

    expect(after.fuelOrWindowRemaining).toBe(11);
  });

  it("floors the fuel-or-time window at zero rather than going negative", () => {
    const before = aircraft({ fuelOrWindowRemaining: 0 });
    const after = only(advance(stateOf(snapshot({ aircraft: [before] }))).state);

    expect(after.fuelOrWindowRemaining).toBe(0);
  });

  // On heading 0 the cosine is exactly 1, so dx is exactly speed/10 — an exact
  // representable tie whenever the speed ends in 5, which is the only way to
  // reach the tie branch on purpose. Every speed here is inside DEFAULT_LIMITS
  // [50000, 300000], so nothing below is clamped or rejected before it moves.
  describe("quantizes an exact tie to the even neighbour", () => {
    function dxFor(speed: number, heading = 0): number {
      return step(heading, speed).position.x;
    }

    it("rounds 10000.5 down to the even 10000", () => {
      expect(dxFor(100_005)).toBe(10_000);
    });

    it("rounds 10001.5 up to the even 10002", () => {
      expect(dxFor(100_015)).toBe(10_002);
    });

    it("rounds 10002.5 down to the even 10002", () => {
      expect(dxFor(100_025)).toBe(10_002);
    });

    // Control: not a tie, so the ordinary nearest-integer rule applies and the
    // even-neighbour branch must not fire.
    it("rounds the non-tie 10000.6 to the nearest 10001", () => {
      expect(dxFor(100_006)).toBe(10_001);
    });

    // The magnitude rounds by the same rule on the negative side and the sign is
    // applied afterwards, so this mirrors the 10000.5 case exactly.
    it("rounds symmetrically about zero on heading 180000", () => {
      expect(dxFor(100_005, 180_000)).toBe(-10_000);
    });
  });

  // A general oblique, where neither component is a special value and the
  // expectation is composed here from the rule's own terms.
  it("matches an independently composed expectation on heading 123456", () => {
    const speed = 275_500;
    const heading = 123_456;
    const { dx, dy } = expectedDelta(speed, heading);
    const moved = step(heading, speed);

    expect(moved.position).toEqual({ x: dx, y: dy, z: 1_000_000 });
    // Guard against a degenerate expectation: this heading must not land on an
    // axis, or the assertion above would prove nothing about the oblique path.
    expect(dx).not.toBe(0);
    expect(dy).not.toBe(0);
  });
});

// --- (b) Byte-identical replay ------------------------------------------------

describe("advanceTick replays a multi-tick run identically", () => {
  it("produces deep-equal outcomes for all 25 ticks of two independent runs", () => {
    const first = run(stateOf(busyWorld()), RUN_TICKS);
    const second = run(stateOf(busyWorld()), RUN_TICKS);

    expect(first).toHaveLength(RUN_TICKS);
    expect(second).toStrictEqual(first);
  });

  // The block above would still pass if only the final states agreed and the
  // paths between them differed, so each intermediate is compared on its own.
  it("agrees at every intermediate tick, not only at the end", () => {
    const first = run(stateOf(busyWorld()), RUN_TICKS);
    const second = run(stateOf(busyWorld()), RUN_TICKS);

    for (let tick = 0; tick < RUN_TICKS; tick++) {
      expect(second.at(tick)).toStrictEqual(first.at(tick));
    }
  });

  it("keeps every aircraft moving, so the replay is not comparing a static world", () => {
    const before = stateOf(busyWorld());
    const outcomes = run(before, RUN_TICKS);
    const last = outcomes.at(-1);
    if (last === undefined) throw new Error("test invariant: run produced no outcomes");

    for (const start of before.snapshot.aircraft) {
      const end = last.snapshot.aircraft.find((a) => a.id === start.id);
      expect(end).toBeDefined();
      expect(end?.position).not.toEqual(start.position);
    }
  });
});

// --- (c) Contract validity and time ------------------------------------------

describe("advanceTick keeps every produced snapshot contract-valid", () => {
  it("passes parseWorldSnapshot at every tick of a 25-tick run", () => {
    for (const outcome of run(stateOf(busyWorld()), RUN_TICKS)) {
      expect(parseWorldSnapshot(outcome.snapshot).ok).toBe(true);
    }
  });

  it("advances simTime by exactly one per tick", () => {
    const initial = stateOf(busyWorld());
    let previous = initial.snapshot.simTime;

    for (const outcome of run(initial, RUN_TICKS)) {
      expect(outcome.snapshot.simTime).toBe(previous + 1);
      previous = outcome.snapshot.simTime;
    }
    expect(previous).toBe(initial.snapshot.simTime + RUN_TICKS);
  });

  it("stamps every outcome with the ruleset in force", () => {
    for (const outcome of run(stateOf(busyWorld()), RUN_TICKS)) {
      expect(outcome.rulesetVersion).toBe(RULESET_VERSION);
    }
  });

  it("keeps every reported position inside the airspace bounds", () => {
    for (const outcome of run(stateOf(busyWorld()), RUN_TICKS)) {
      for (const plane of outcome.snapshot.aircraft) {
        expect(Math.abs(plane.position.x)).toBeLessThanOrEqual(AIRSPACE_BOUND_MM);
        expect(Math.abs(plane.position.y)).toBeLessThanOrEqual(AIRSPACE_BOUND_MM);
        expect(plane.position.z).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// --- (d) Purity ---------------------------------------------------------------

describe("advanceTick never mutates its inputs", () => {
  it("advances a deeply frozen state and command list without throwing", () => {
    const input = deepFreeze(busyWorld());
    const state = stateOf(input);
    const commands = deepFreeze([] as readonly MotionCommand[]);

    expect(() => {
      let current: WorldEngineState = state;
      for (let i = 0; i < 5; i++) {
        current = advance(current, commands).state;
      }
    }).not.toThrow();
  });

  it("leaves the caller's snapshot deep-equal to a freshly built identical one", () => {
    const input = deepFreeze(busyWorld());
    const state = stateOf(input);

    let current: WorldEngineState = state;
    for (let i = 0; i < 5; i++) {
      current = advance(current).state;
    }

    // A frozen object silently ignores writes outside strict mode, so equality
    // against a pristine rebuild is what actually proves nothing was edited.
    expect(input).toStrictEqual(busyWorld());
    expect(state.snapshot).toStrictEqual(stateOf(busyWorld()).snapshot);
  });

  it("returns fresh state and snapshot references rather than the caller's", () => {
    const state = stateOf(busyWorld());
    const outcome = advance(state);

    expect(outcome.state).not.toBe(state);
    expect(outcome.state.snapshot).not.toBe(state.snapshot);
  });

  it("moves the returned aircraft while the caller's copy stays put", () => {
    const state = stateOf(busyWorld());
    const before = byId(state, "AC-1").position;
    const outcome = advance(state);

    expect(byId(outcome.state, "AC-1").position).toEqual({ x: 10_000, y: 0, z: 1_000_000 });
    expect(byId(state, "AC-1").position).toEqual(before);
  });
});

// --- (e) Empty world ----------------------------------------------------------

describe("advanceTick advances a world with no aircraft", () => {
  it("succeeds and returns an empty aircraft list one tick later", () => {
    const state = stateOf(snapshot({ aircraft: [] }));
    const outcome = advance(state);

    expect(outcome.state.snapshot.aircraft).toEqual([]);
    expect(outcome.state.snapshot.simTime).toBe(state.snapshot.simTime + 1);
  });

  it("reports nothing applied, rejected, superseded, or observed", () => {
    const outcome = advance(stateOf(snapshot({ aircraft: [] })));

    expect(outcome.events).toEqual([]);
    expect(outcome.applied).toEqual([]);
    expect(outcome.rejected).toEqual([]);
    expect(outcome.superseded).toEqual([]);
  });
});
