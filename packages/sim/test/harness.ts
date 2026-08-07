// Shared execution harness for the world engine suites.
//
// Every suite advances ticks through `advance` below, which is the one place
// `advanceTick` is actually called. That is deliberate: the declared motion
// rule (research R2) is checked on every tick of every suite this way, not
// only wherever a test author remembered to assert `position.x`/`.y`. Before
// this harness existed, a correct oracle for the rule (`expectedDelta`) had
// exactly one call site, on an uncommanded aircraft — see
// `expectDisplacementDeclared` below for what that missed.
//
// This module depends on `vitest`; `fixtures.ts` deliberately does not, so it
// stays usable outside a test run (a replay tool, a fuzz driver). Keep that
// split — helpers that only assert belong here, builders belong there.
import { expect } from "vitest";
import { AIRSPACE_BOUND_MM, type AircraftState, type WorldSnapshot } from "@model-planes/core";
import { perTickMm } from "../src/ruleset.ts";
import { cosMillideg, sinMillideg } from "../src/trig.ts";
import { advanceTick, type TickOutcome } from "../src/world-engine.ts";
import { createWorldEngineState, type WorldEngineState } from "../src/world-engine-state.ts";
import { type MotionCommand, deepFreeze, snapshot } from "./fixtures.ts";

export type { TickOutcome };

const MS_PER_TICK = 100;
const MS_PER_SECOND = 1000;

/**
 * Round-half-to-even, written independently of `ruleset.ts`.
 *
 * Importing the engine's own `quantizeHalfToEven` would make every
 * displacement assertion below a tautology — the test would agree with the
 * implementation by construction. This version reaches the same rule by a
 * different route (`Math.round` plus an explicit tie correction) so agreeing
 * with it is evidence.
 *
 * `cosMillideg`/`sinMillideg` ARE the engine's own — deliberately.
 * `trig.test.ts` independently checks that table against `Math.sin`/`Math.cos`
 * over a dense sweep plus edge angles; re-deriving trig here would duplicate
 * that suite's job and add a second thing to keep correct.
 */
function halfToEven(value: number): number {
  const negative = value < 0;
  const magnitude = negative ? -value : value;
  const down = Math.floor(magnitude);
  const isTie = magnitude - down === 0.5;
  const rounded = isTie ? (down % 2 === 0 ? down : down + 1) : Math.round(magnitude);
  return negative && rounded !== 0 ? -rounded : rounded;
}

/** The declared one-tick displacement, recomposed from the rule's own terms. */
export function expectedDelta(
  speed: number,
  headingMillideg: number,
): { readonly dx: number; readonly dy: number } {
  const distanceScaled = speed * MS_PER_TICK;
  return {
    dx: halfToEven((distanceScaled * cosMillideg(headingMillideg)) / MS_PER_SECOND),
    dy: halfToEven((distanceScaled * sinMillideg(headingMillideg)) / MS_PER_SECOND),
  };
}

const clampToAirspace = (v: number): number =>
  v > AIRSPACE_BOUND_MM ? AIRSPACE_BOUND_MM : v < -AIRSPACE_BOUND_MM ? -AIRSPACE_BOUND_MM : v;

/**
 * The rule every tick must satisfy (research R2): horizontal position advances
 * by the declared step computed from the **post-steering** heading and speed —
 * the values the outcome itself reports — then clamped to the airspace.
 *
 * Checked on every `advance` call in every suite. Edge cases are handled
 * explicitly rather than exempted:
 *
 *   - An already-`exited` (frozen) aircraft neither steers nor moves, so its
 *     delta must be exactly zero in x, y, *and* z — stronger than the
 *     free-flight rule below, not weaker.
 *   - An aircraft clamped *this* tick is compared against the clamped value,
 *     and must also be flagged `exited` and carry a matching
 *     `airspaceExited` event, so the clamp, the flag, and the event can never
 *     drift apart.
 *   - Altitude is bounded (`|Δz| ≤ perTickMm(...)`), not equated: it is a
 *     steering result, not a displacement, and a bound is trivially satisfied
 *     when `perTickMm` returns 0 — it catches overshoot, not a stall. Stall
 *     regressions live in `motion.test.ts` instead.
 *
 * Failures use a `motion invariant:` prefix, distinct from the existing
 * `test invariant:` convention (a broken test *setup*) — this names a defect
 * in the engine, not in whichever suite happened to be running when it fired.
 */
function expectDisplacementDeclared(before: WorldEngineState, outcome: TickOutcome): void {
  const priorFleet = before.snapshot.aircraft;
  const nextFleet = outcome.state.snapshot.aircraft;
  const tick = outcome.state.snapshot.simTime;

  expect(
    nextFleet.map((entry) => entry.id),
    `motion invariant: fleet identity changed at tick ${tick}`,
  ).toEqual(priorFleet.map((entry) => entry.id));

  for (const [index, prior] of priorFleet.entries()) {
    const next = nextFleet[index] as AircraftState;
    const at = `motion invariant: ${prior.id} at tick ${tick}`;

    if (before.exited.has(prior.id)) {
      expect(next.position, `${at}: frozen aircraft moved`).toEqual(prior.position);
      continue;
    }

    const { dx, dy } = expectedDelta(next.speed, next.heading);
    const rawX = prior.position.x + dx;
    const rawY = prior.position.y + dy;
    const clampedX = clampToAirspace(rawX);
    const clampedY = clampToAirspace(rawY);

    expect(
      { x: next.position.x, y: next.position.y },
      `${at}: displacement must use the post-steering heading ${next.heading} ` +
        `and speed ${next.speed}, giving (${dx}, ${dy})`,
    ).toEqual({ x: clampedX, y: clampedY });

    if (clampedX !== rawX || clampedY !== rawY) {
      expect(outcome.state.exited.has(prior.id), `${at}: clamped but not flagged exited`).toBe(
        true,
      );
      expect(outcome.events, `${at}: clamped but no airspaceExited event`).toContainEqual({
        kind: "airspaceExited",
        aircraftId: prior.id,
        tick,
      });
    }

    const dz = next.position.z - prior.position.z;
    const bound = perTickMm(dz >= 0 ? prior.limits.maxClimbRate : prior.limits.maxDescentRate, tick);
    expect(
      Math.abs(dz),
      `${at}: altitude step ${dz} exceeds bound ${bound}`,
    ).toBeLessThanOrEqual(bound);
  }
}

/**
 * Advance one tick and check the declared motion rule.
 *
 * An `err` is asserted against, not merely thrown: `advanceTick` re-validates
 * every produced snapshot against the contract, so an `err` means a rule
 * produced an off-contract value — worth naming in the failure output, in
 * every suite, not only where illegality is the thing under test.
 *
 * `performance.test.ts` calls `advanceTick` directly instead of through this
 * function — the SC-005 budget must measure the engine, not this invariant.
 */
export function advance(
  state: WorldEngineState,
  commands: readonly MotionCommand[] = [],
): TickOutcome {
  const result = advanceTick(state, commands);
  expect(
    result.ok ? "" : `${result.error.field}: ${result.error.message}`,
    "advanceTick must report rule violations as rejections, never as an error",
  ).toBe("");
  if (!result.ok) {
    throw new Error(`advanceTick errored: ${result.error.field}: ${result.error.message}`);
  }
  expectDisplacementDeclared(state, result.value);
  return result.value;
}

/** Wraps a snapshot as an initial state, deep-frozen so any input mutation throws. */
export function stateOf(input: WorldSnapshot): WorldEngineState {
  const created = createWorldEngineState(deepFreeze(input));
  if (!created.ok) {
    throw new Error(
      `test invariant: fixture snapshot is contract-invalid: ${created.error.message}`,
    );
  }
  return created.value;
}

/** Sugar for the common case: an initial state over `fleet` at `simTime` (default 0). */
export function stateOver(fleet: readonly AircraftState[], simTime = 0): WorldEngineState {
  return stateOf(snapshot({ simTime, aircraft: fleet }));
}

/** Runs `count` ticks, submitting `commandsByTick.get(i)` on the i-th call. */
export function run(
  initial: WorldEngineState,
  count: number,
  commandsByTick: ReadonlyMap<number, readonly MotionCommand[]> = new Map(),
): readonly TickOutcome[] {
  const outcomes: TickOutcome[] = [];
  let state = initial;
  for (let i = 0; i < count; i++) {
    const outcome = advance(state, commandsByTick.get(i) ?? []);
    outcomes.push(outcome);
    state = outcome.state;
  }
  return outcomes;
}

/** Sugar for the common case: one batch on the very first call. */
export function runWithFirstBatch(
  initial: WorldEngineState,
  count: number,
  commands: readonly MotionCommand[],
): readonly TickOutcome[] {
  return run(initial, count, new Map([[0, commands]]));
}

/** The aircraft `id` in a state — absence is a test failure. */
export function aircraftIn(state: WorldEngineState, id: string): AircraftState {
  const found = state.snapshot.aircraft.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`test invariant: aircraft ${id} vanished from the snapshot`);
  }
  return found;
}

/** The aircraft `id` in an outcome's snapshot. */
export function planeIn(outcome: TickOutcome, id: string): AircraftState {
  return aircraftIn(outcome.state, id);
}

/** The outcome at `index` — a short run is a test-setup bug, not a failure. */
export function tickAt(outcomes: readonly TickOutcome[], index: number): TickOutcome {
  const outcome = outcomes[index];
  if (outcome === undefined) {
    throw new Error(`test invariant: run shorter than ${index + 1} ticks`);
  }
  return outcome;
}
