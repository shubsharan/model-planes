// The world engine's working state (data-model.md "WorldEngineState").
//
// `WorldSnapshot` deliberately carries no assigned targets — FEAT-0001 keeps
// derived intent out of observed state — yet convergence needs them between
// ticks. They live here instead, as an explicit value that is fully
// reconstructable by folding the applied-command log from the initial snapshot.
// That is what keeps replay sufficient (Constitution I): snapshot + command
// stream ⇒ identical assignments ⇒ identical run.
//
// Every value in this module is immutable; each tick returns a fresh state.
import type { Mm, Millideg, MmPerSec, Result, WorldSnapshot } from "@model-planes/core";
import { parseWorldSnapshot } from "@model-planes/core";
import type { MotionCommand } from "./legality.ts";
import { err, ok } from "./result.ts";

/**
 * The three dimensions a motion command can target, in the engine's declared
 * ordering. Single source for both the assignment vocabulary (`assignments.ts`)
 * and the event vocabulary (`world-engine.ts`'s `TargetDimension`, re-exported
 * from there under that name for the public contract) — one union instead of
 * two independently declared but structurally identical ones.
 */
export const DIMENSIONS = ["heading", "altitude", "speed"] as const;
export type AssignmentDimension = (typeof DIMENSIONS)[number];

/**
 * The targets one aircraft is converging toward, plus commands already admitted
 * but not yet effective.
 *
 * A target is absent until a command of that kind takes effect, and is dropped
 * again once exactly attained — at which point the aircraft simply holds the
 * value, since nothing else moves it. Every stored target is legal for the
 * aircraft: admission (`legality.ts`) rejects out-of-limits parameters, so an
 * assignment can never hold an unreachable target.
 */
export interface AircraftAssignments {
  readonly targetHeading?: Millideg;
  readonly targetAltitude?: Mm;
  readonly targetSpeed?: MmPerSec;
  /** Admitted, not yet effective. Sorted by (`effectiveAt`, admission order). */
  readonly pending: readonly MotionCommand[];
}

/** An aircraft with no assignments at all — the state every aircraft starts in. */
export const NO_ASSIGNMENTS: AircraftAssignments = Object.freeze({
  pending: Object.freeze([]) as readonly MotionCommand[],
});

/** The world engine's complete working state. Immutable. */
export interface WorldEngineState {
  readonly snapshot: WorldSnapshot;
  /** Aircraft id → assignments. Keys are always a subset of the snapshot's ids. */
  readonly assignments: ReadonlyMap<string, AircraftAssignments>;
  /** Aircraft frozen at the airspace boundary (research R8). */
  readonly exited: ReadonlySet<string>;
  /** Aircraft whose fuel-or-time window has reached 0. Permanent. */
  readonly exhausted: ReadonlySet<string>;
}

/**
 * Validate a snapshot and wrap it as an initial state with no assignments, no
 * `exited` flags, and `exhausted` seeded from the snapshot itself.
 *
 * Takes `unknown` and defers entirely to the core parser, so the world engine
 * introduces no error vocabulary of its own: a snapshot this rejects is
 * rejected for exactly the reason the contract rejects it, with the same field
 * and message. Errs iff the snapshot is contract-invalid.
 *
 * `exhausted` is seeded, not left empty: an aircraft whose fuel-or-time window
 * is already 0 at construction has already reached the state the field
 * describes, even though it never *transitioned* there under this API. The
 * `fuelExhausted` event stays transition-only (research R8) — state and event
 * answer different questions, and it is correct that they differ here.
 */
export function createWorldEngineState(snapshot: unknown): Result<WorldEngineState> {
  const parsed = parseWorldSnapshot(snapshot);
  if (!parsed.ok) return err(parsed.error);

  const exhausted = new Set<string>();
  for (const entry of parsed.value.aircraft) {
    if (entry.fuelOrWindowRemaining === 0) exhausted.add(entry.id);
  }

  return ok({
    snapshot: parsed.value,
    assignments: new Map<string, AircraftAssignments>(),
    exited: new Set<string>(),
    exhausted,
  });
}
