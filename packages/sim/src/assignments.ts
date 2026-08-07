// Folding admitted commands into per-aircraft assignments (research R5, R6).
//
// `WorldSnapshot` carries no targets, so the convergence targets an aircraft is
// flying toward live here instead. Everything in this module is a pure fold:
// given the assignments so far plus the commands admitted this tick, produce the
// assignments after. That is what makes the whole structure reconstructable from
// the applied-command log, and therefore what keeps replay sufficient
// (Constitution I) without adding a field to the contract.
import type { Millideg, Mm, MmPerSec } from "@model-planes/core";
import type { CommandSupersession, MotionCommand } from "./legality.ts";
import {
  type AircraftAssignments,
  type AssignmentDimension,
  NO_ASSIGNMENTS,
} from "./world-engine-state.ts";

export type { AssignmentDimension };

/** True when an entry holds nothing at all and can be dropped from the map. */
function isEmpty(entry: AircraftAssignments): boolean {
  return (
    entry.pending.length === 0 &&
    entry.targetHeading === undefined &&
    entry.targetAltitude === undefined &&
    entry.targetSpeed === undefined
  );
}

/**
 * Insert into the pending queue, preserving its `(effectiveAt, admission order)`
 * sort: the command goes after every entry that is due no later than it. A plain
 * append would be wrong once a command is admitted for an earlier tick than one
 * already queued.
 */
function insertPending(
  pending: readonly MotionCommand[],
  command: MotionCommand,
): readonly MotionCommand[] {
  const next = [...pending];
  let index = next.length;
  while (index > 0) {
    const previous = next[index - 1];
    if (previous === undefined || previous.effectiveAt <= command.effectiveAt) break;
    index -= 1;
  }
  next.splice(index, 0, command);
  return next;
}

export interface AdmissionFold {
  readonly assignments: ReadonlyMap<string, AircraftAssignments>;
  /** In submission order — one entry per displaced command. */
  readonly superseded: readonly CommandSupersession[];
}

/**
 * Queue already-legal commands, resolving duplicates last-wins.
 *
 * Two admitted commands of the same kind, for the same aircraft, at the same
 * effective tick cannot both be the truth at that tick, so the later submission
 * displaces the earlier. That is reported explicitly rather than silently
 * dropped: supervisory control is a stream of corrections, and a trace that lost
 * the corrected-away proposal would misrepresent what the controller did
 * (research R6).
 *
 * Same kind at a *different* effective tick is not a duplicate — both stand, and
 * the later one simply replaces the target when its own tick arrives.
 */
export function admitCommands(
  current: ReadonlyMap<string, AircraftAssignments>,
  commands: readonly MotionCommand[],
): AdmissionFold {
  if (commands.length === 0) {
    return { assignments: current, superseded: [] };
  }

  const assignments = new Map(current);
  const superseded: CommandSupersession[] = [];

  for (const command of commands) {
    const entry = assignments.get(command.target) ?? NO_ASSIGNMENTS;
    const duplicate = entry.pending.findIndex(
      (queued) => queued.kind === command.kind && queued.effectiveAt === command.effectiveAt,
    );

    let pending = entry.pending;
    if (duplicate !== -1) {
      const earlier = pending[duplicate];
      if (earlier !== undefined) superseded.push({ superseded: earlier, by: command });
      pending = [...pending.slice(0, duplicate), ...pending.slice(duplicate + 1)];
    }

    assignments.set(command.target, { ...entry, pending: insertPending(pending, command) });
  }

  return { assignments, superseded };
}

export interface ActivationFold {
  readonly assignments: AircraftAssignments;
  /** Commands that became active this tick, in queue order. */
  readonly applied: readonly MotionCommand[];
}

/**
 * Promote every pending command due at `tick` into an active target.
 *
 * The queue is sorted, so the due commands are its prefix. Applying them in
 * queue order means a same-tick pair of different kinds both land, and the
 * `applied` report reads in the order the engine actually used them.
 */
export function activateDue(entry: AircraftAssignments, tick: number): ActivationFold {
  let dueCount = 0;
  while (dueCount < entry.pending.length) {
    const candidate = entry.pending[dueCount];
    if (candidate === undefined || candidate.effectiveAt > tick) break;
    dueCount += 1;
  }
  if (dueCount === 0) return { assignments: entry, applied: [] };

  const applied = entry.pending.slice(0, dueCount);
  let next: AircraftAssignments = { ...entry, pending: entry.pending.slice(dueCount) };

  for (const command of applied) {
    switch (command.kind) {
      case "assignHeading":
        next = { ...next, targetHeading: command.params.heading };
        break;
      case "assignAltitude":
        next = { ...next, targetAltitude: command.params.altitude };
        break;
      case "assignSpeed":
        next = { ...next, targetSpeed: command.params.speed };
        break;
    }
  }

  return { assignments: next, applied };
}

/**
 * Drop a target that has been exactly attained.
 *
 * Holding is then automatic — nothing else moves that dimension — and it makes
 * `targetReached` fire exactly once instead of on every tick the aircraft sits
 * on its assigned value.
 */
export function clearTarget(
  entry: AircraftAssignments,
  dimension: AssignmentDimension,
): AircraftAssignments {
  // Rebuilt field by field rather than spread-and-`delete`: a spread would leave
  // the key present with an `undefined` value, and two states that differ only in
  // whether a key exists are not deep-equal — which would break the byte-identity
  // assertions for no reason anyone could see.
  const next: {
    targetHeading?: Millideg;
    targetAltitude?: Mm;
    targetSpeed?: MmPerSec;
    pending: readonly MotionCommand[];
  } = { pending: entry.pending };

  if (dimension !== "heading" && entry.targetHeading !== undefined) {
    next.targetHeading = entry.targetHeading;
  }
  if (dimension !== "altitude" && entry.targetAltitude !== undefined) {
    next.targetAltitude = entry.targetAltitude;
  }
  if (dimension !== "speed" && entry.targetSpeed !== undefined) {
    next.targetSpeed = entry.targetSpeed;
  }
  return next;
}

/** Store `entry` for `id`, or drop the key entirely when nothing is left to track. */
export function storeEntry(
  assignments: Map<string, AircraftAssignments>,
  id: string,
  entry: AircraftAssignments,
): void {
  if (isEmpty(entry)) {
    assignments.delete(id);
    return;
  }
  assignments.set(id, entry);
}
