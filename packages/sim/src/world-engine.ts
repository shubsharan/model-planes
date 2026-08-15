// The tick engine: `advanceTick` (spec FR-001 – FR-010).
//
// One call advances the world by exactly one tick. It is a pure function of
// (state, commands, RULESET_VERSION): no clock, no randomness, no hidden state,
// no `Math` transcendental. Inputs are never mutated — every tick returns fresh
// values — so a caller can hold a state and replay from it any number of times.
//
// The update order below is fixed and declared (research R2). It matters: with
// steering before motion, a turn commanded this tick takes effect on this
// tick's displacement, and there is exactly one legal next state for any input.
import {
  AIRSPACE_BOUND_MM,
  type AircraftState,
  type Result,
  type SchemaError,
  type Tick,
  type WorldSnapshot,
  asMillideg,
  asMm,
  asMmPerSec,
  asTick,
  parseWorldSnapshot,
} from "@model-planes/core";
import { activateDue, admitCommands, clearTarget, storeEntry } from "./assignments.ts";
import {
  type CommandRejection,
  type CommandSupersession,
  type MotionCommand,
  screenCommands,
} from "./legality.ts";
import {
  MS_PER_SECOND,
  RULESET_VERSION,
  nextFuel,
  perTickMm,
  quantizeHalfToEven,
  shortestTurnMillideg,
  tickDistanceScaled,
  wrapHeadingMillideg,
} from "./ruleset.ts";
import { err, ok } from "./result.ts";
import { sinCosMillideg } from "./trig.ts";
import {
  type AircraftAssignments,
  type AssignmentDimension,
  DIMENSIONS,
  NO_ASSIGNMENTS,
  type WorldEngineState,
} from "./world-engine-state.ts";

/**
 * The dimension a `targetReached` event refers to — the assignment vocabulary
 * (`world-engine-state.ts`'s `AssignmentDimension`), re-exported under the
 * public contract's name (`world-engine-api.md`).
 */
export type TargetDimension = AssignmentDimension;

/** Something that happened to one aircraft on one tick. */
export type WorldEngineEvent =
  | { readonly kind: "airspaceExited"; readonly aircraftId: string; readonly tick: Tick }
  | { readonly kind: "fuelExhausted"; readonly aircraftId: string; readonly tick: Tick }
  | {
      readonly kind: "targetReached";
      readonly aircraftId: string;
      readonly tick: Tick;
      readonly dimension: TargetDimension;
    };

/**
 * The complete result of one `advanceTick`.
 *
 * `applied`/`rejected`/`superseded` account for every command *resolved* this
 * tick: submitted commands that were rejected outright, and any command —
 * submitted now or queued earlier — whose `effectiveAt` is this tick. A
 * legally admitted command with a future `effectiveAt` is not silently
 * dropped; it is queued in `state.assignments.get(id).pending` and will
 * appear in `applied` (or `superseded`, if displaced first) on the tick it
 * actually resolves. Nothing about it is lost between now and then.
 */
export interface TickOutcome {
  readonly rulesetVersion: number;
  /** The next state; its `snapshot.simTime` is exactly one greater. */
  readonly state: WorldEngineState;
  /** Commands that took effect this tick, in application order. */
  readonly applied: readonly MotionCommand[];
  /** Refused commands, in submission order. */
  readonly rejected: readonly CommandRejection[];
  readonly superseded: readonly CommandSupersession[];
  /** Ordered by aircraft id, then event kind — never by discovery order. */
  readonly events: readonly WorldEngineEvent[];
}

/**
 * Event sort keys. Events are emitted in whatever order the per-aircraft pass
 * discovers them; the outcome exposes them in a declared total order instead, so
 * two runs of the same input cannot differ in event sequence.
 */
const EVENT_KIND_RANK: Readonly<Record<WorldEngineEvent["kind"], number>> = {
  airspaceExited: 0,
  fuelExhausted: 1,
  targetReached: 2,
};

function compareEvents(a: WorldEngineEvent, b: WorldEngineEvent): number {
  if (a.aircraftId !== b.aircraftId) return a.aircraftId < b.aircraftId ? -1 : 1;
  const kindDelta = EVENT_KIND_RANK[a.kind] - EVENT_KIND_RANK[b.kind];
  if (kindDelta !== 0) return kindDelta;
  if (a.kind === "targetReached" && b.kind === "targetReached") {
    return DIMENSIONS.indexOf(a.dimension) - DIMENSIONS.indexOf(b.dimension);
  }
  return 0;
}

/** Clamp `value` into `[-bound, +bound]`. All operands are integers. */
function clampStep(value: number, bound: number): number {
  if (value > bound) return bound;
  if (value < -bound) return -bound;
  return value;
}

/**
 * Horizontal displacement for one tick (research R2 step 4), using the given
 * heading and speed.
 *
 * Takes scalars, not an `AircraftState`: nothing named `previous` is in scope
 * here, so there is no pre-steer value this function *could* read by mistake.
 * The caller is responsible for passing the post-steering heading and speed —
 * the values the tick's outcome itself reports — which is what makes "use the
 * *new* heading and speed" (research R2) structural at the call site rather
 * than a discipline to remember inline.
 */
function displace(
  x: number,
  y: number,
  heading: number,
  speed: number,
): { readonly x: number; readonly y: number } {
  const scaled = tickDistanceScaled(speed);
  const { sin, cos } = sinCosMillideg(heading);
  return {
    x: x + quantizeHalfToEven((scaled * cos) / MS_PER_SECOND),
    y: y + quantizeHalfToEven((scaled * sin) / MS_PER_SECOND),
  };
}

/** Mutable scratch for one tick, so the per-aircraft pass stays readable. */
interface TickScratch {
  readonly tick: Tick;
  readonly events: WorldEngineEvent[];
  readonly exited: Set<string>;
  readonly exhausted: Set<string>;
}

/** One aircraft's outcome for the tick: its new state and its new assignments. */
interface AircraftAdvance {
  readonly aircraft: AircraftState;
  readonly assignments: AircraftAssignments;
}

/**
 * Advance one aircraft by one tick: steer, move, then consume resources.
 *
 * An aircraft already in `exited` is frozen — it neither steers nor moves — but
 * its fuel window still runs down, because freezing is a motion rule and fuel is
 * a resource rule (research R8).
 */
function advanceAircraft(
  previous: AircraftState,
  entry: AircraftAssignments,
  scratch: TickScratch,
): AircraftAdvance {
  const frozen = scratch.exited.has(previous.id);

  let assignments = entry;
  let heading: number = previous.heading;
  let speed: number = previous.speed;
  let altitude: number = previous.position.z;

  const reached = (dimension: TargetDimension): void => {
    scratch.events.push({
      kind: "targetReached",
      aircraftId: previous.id,
      tick: scratch.tick,
      dimension,
    });
    assignments = clearTarget(assignments, dimension);
  };

  // --- Steer (research R2 step 3) ---
  //
  // Before the position update, so a turn commanded this tick bends this tick's
  // displacement. Each dimension converges independently and snaps exactly onto
  // its target, which is what makes a target reachable and held rather than
  // approached forever (spec SC-003).
  if (!frozen) {
    const { targetHeading, targetAltitude, targetSpeed } = assignments;

    if (targetHeading !== undefined) {
      const turn = shortestTurnMillideg(heading, targetHeading);
      heading = wrapHeadingMillideg(heading + clampStep(turn, previous.limits.maxTurnRate));
      if (heading === targetHeading) reached("heading");
    }

    if (targetSpeed !== undefined) {
      // Ruleset v1 has no acceleration limit (research R4), so an admitted speed
      // is reached at its effective tick — always in one step, hence no arrival
      // test here: the assignment *is* the arrival.
      speed = targetSpeed;
      reached("speed");
    }

    if (targetAltitude !== undefined) {
      const climbing = targetAltitude >= altitude;
      const bound = perTickMm(
        climbing ? previous.limits.maxClimbRate : previous.limits.maxDescentRate,
        scratch.tick,
      );
      altitude += clampStep(targetAltitude - altitude, bound);
      // Floored by the motion rule itself, so an out-of-range altitude is never
      // produced and then corrected — it is never produced.
      if (altitude < 0) altitude = 0;
      if (altitude === targetAltitude) reached("altitude");
    }
  }

  // --- Move (research R2 step 4) ---
  //
  // `displace` takes `heading`/`speed` — the locals above, already steered —
  // never `previous.heading`/`previous.speed`.
  let x: number = previous.position.x;
  let y: number = previous.position.y;

  if (!frozen) {
    const moved = displace(x, y, heading, speed);
    const clampedX = clampStep(moved.x, AIRSPACE_BOUND_MM);
    const clampedY = clampStep(moved.y, AIRSPACE_BOUND_MM);
    if (clampedX !== moved.x || clampedY !== moved.y) {
      // Clamp rather than report an out-of-bounds position: the latter would not
      // even pass `parseWorldSnapshot`. The aircraft is flagged and frozen here;
      // what that *means* (divert, scoring) belongs to later features.
      //
      // Landing exactly ON the boundary (`clampedX === moved.x`) does not enter
      // this branch, and that is deliberate, not an oversight: the boundary
      // point itself is a valid in-bounds position (core's range check on
      // position is inclusive), and research R8 / the contract's guarantee 7
      // both name the event for a *crossing* — motion that would have left the
      // valid volume — not merely touching its edge. An aircraft that kisses
      // the boundary exactly and turns back inward never left the airspace.
      scratch.exited.add(previous.id);
      scratch.events.push({
        kind: "airspaceExited",
        aircraftId: previous.id,
        tick: scratch.tick,
      });
    }
    x = clampedX;
    y = clampedY;
  }

  // --- Resources (research R8) ---
  const fuelBefore = previous.fuelOrWindowRemaining;
  const fuelAfter = nextFuel(fuelBefore);
  if (fuelBefore > 0 && fuelAfter === 0) {
    // Fires on the 1 → 0 transition only. An aircraft that starts at 0 never
    // transitions and so never raises the event.
    scratch.exhausted.add(previous.id);
    scratch.events.push({
      kind: "fuelExhausted",
      aircraftId: previous.id,
      tick: scratch.tick,
    });
  }

  return {
    aircraft: {
      ...previous,
      position: { x: asMm(x), y: asMm(y), z: asMm(altitude) },
      heading: asMillideg(heading),
      speed: asMmPerSec(speed),
      fuelOrWindowRemaining: fuelAfter,
    },
    assignments,
  };
}

/**
 * Advance exactly one tick.
 *
 * `commands` are this tick's newly submitted proposals, in submission order.
 * Command illegality is expressed as `rejected`, never as an error. This returns
 * `err` on structural impossibility or when `simTime` has reached the largest
 * exactly representable tick and therefore has no valid successor.
 */
export function advanceTick(
  state: WorldEngineState,
  commands: readonly MotionCommand[],
): Result<TickOutcome> {
  const previous = state.snapshot;
  const nextTick = previous.simTime + 1;
  if (!Number.isSafeInteger(nextTick)) {
    const error: SchemaError = {
      field: "WorldSnapshot.simTime",
      reason: "out-of-range",
      message: `WorldSnapshot.simTime cannot advance beyond ${Number.MAX_SAFE_INTEGER}`,
    };
    return err(error);
  }
  const tick = asTick(nextTick);

  const scratch: TickScratch = {
    tick,
    events: [],
    exited: new Set(state.exited),
    exhausted: new Set(state.exhausted),
  };

  const applied: MotionCommand[] = [];

  // --- Admission (research R6) ---
  //
  // Screening first, so an illegal command never reaches the assignment fold and
  // therefore cannot change a target, be superseded, or displace anything. Its
  // batch-mates are unaffected.
  const screening = screenCommands(previous, tick, commands);
  const rejected = screening.rejected;

  const fold = admitCommands(state.assignments, screening.admitted);
  const superseded = fold.superseded;
  const assignments = new Map(fold.assignments);

  // --- Activation, steering, motion, resources ---
  //
  // Snapshot order is the application order: it is the one ordering that is
  // already fixed by the contract, so `applied` reads the same on every run.
  const aircraft = previous.aircraft.map((entry) => {
    const activation = activateDue(assignments.get(entry.id) ?? NO_ASSIGNMENTS, tick);
    applied.push(...activation.applied);

    const advanced = advanceAircraft(entry, activation.assignments, scratch);
    storeEntry(assignments, entry.id, advanced.assignments);
    return advanced.aircraft;
  });

  const nextSnapshot: WorldSnapshot = {
    schemaVersion: previous.schemaVersion,
    simTime: tick,
    aircraft,
    runways: previous.runways,
  };

  // Re-validate against the contract rather than trusting the arithmetic. This
  // is the guarantee callers rely on (contract §2), and it is where a future
  // rule change that produces an off-contract value fails loudly instead of
  // writing an invalid state into a trace.
  const parsed = parseWorldSnapshot(nextSnapshot);
  if (!parsed.ok) return err(parsed.error);

  scratch.events.sort(compareEvents);

  return ok({
    rulesetVersion: RULESET_VERSION,
    state: {
      snapshot: parsed.value,
      assignments,
      exited: scratch.exited,
      exhausted: scratch.exhausted,
    },
    applied,
    rejected,
    superseded,
    events: scratch.events,
  });
}
