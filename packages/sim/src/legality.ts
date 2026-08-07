// The world engine's control surface and its admission rules (research R6, R7).
//
// Two separate ideas live here, and the distinction is the point:
//
//   - Which commands can even be *expressed* — the `MotionCommand` union. A kind
//     outside it is not "rejected"; it cannot be submitted at all.
//   - Which expressible commands are *legal* — the checks below, each producing a
//     machine-readable reason and leaving the world untouched.
//
// Nothing here clamps. An out-of-limits parameter refuses the whole command, so
// an accepted command is always applied exactly as proposed and the raw-proposal
// versus applied distinction the trace depends on stays clean (spec FR-007).
import {
  AIRSPACE_BOUND_MM,
  type AircraftState,
  type Command,
  type WorldSnapshot,
} from "@model-planes/core";

/**
 * Exactly the three vocabulary kinds that move an aircraft.
 *
 * Narrowed from core's `Command`, so any real command of these kinds is
 * assignable without conversion. The other six kinds (`hold`, `assignRunway`,
 * `clearApproach`, `clearLand`, `goAround`, `divert`) are authorizations and
 * declarations, not kinematic inputs: nothing in them moves an aircraft, which
 * is all this feature does. They are deliberately unrepresentable here rather
 * than rejected at runtime, so no run produced by this API can record that a
 * clearance was *applied* during a tick in which clearances carry no meaning.
 * FEAT-0003 widens this union when it has runway semantics to attach.
 */
export type MotionCommand = Extract<
  Command,
  { kind: "assignHeading" | "assignAltitude" | "assignSpeed" }
>;

/**
 * Why a command was refused. Every member is a *controller* error.
 *
 * There is deliberately no "unsupported kind" member: unsupported kinds are
 * unrepresentable at this interface rather than rejected, so labelling correct
 * controller behaviour as an error — and polluting the illegal-command-rate
 * metric with it — cannot happen (research R7).
 */
export const REJECTION_REASONS = [
  "unknownTarget",
  "staleEffectiveAt",
  "speedOutOfLimits",
  "altitudeOutOfRange",
  "headingOutOfRange",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

export interface CommandRejection {
  /** Exactly as proposed — never edited, so the raw proposal stays auditable. */
  readonly command: MotionCommand;
  readonly reason: RejectionReason;
  /** Human-readable, non-normative. Never parse this. */
  readonly detail: string;
}

/**
 * A later command of the same kind, for the same aircraft, at the same effective
 * tick displaced an earlier one. An explicit outcome, not a rejection: both
 * commands stay visible, so nothing is silently collapsed (research R6).
 */
export interface CommandSupersession {
  readonly superseded: MotionCommand;
  readonly by: MotionCommand;
}

// --- Admission ---------------------------------------------------------------

function reject(command: MotionCommand, reason: RejectionReason, detail: string): CommandRejection {
  // `command` is passed through by reference, never rebuilt: the proposal a
  // caller reads back out of a rejection must be byte-for-byte what it sent.
  return { command, reason, detail };
}

/**
 * The single legality check for one command, in a fixed order — the first
 * failing check decides the reason, so a command that is wrong in two ways
 * reports the same reason on every run.
 *
 * Target identity is checked first because every later check reads the targeted
 * aircraft's own limits.
 */
function screen(
  command: MotionCommand,
  aircraft: AircraftState | undefined,
  nextTick: number,
): CommandRejection | undefined {
  if (aircraft === undefined) {
    return reject(
      command,
      "unknownTarget",
      `no aircraft "${command.target}" in the world snapshot`,
    );
  }

  if (command.effectiveAt < nextTick) {
    // Rejected, not deferred: quietly moving a command forward would rewrite
    // controller intent, and in this feature's generous frozen-tick regime a
    // caller can always pick a legal effective tick (research R6).
    return reject(
      command,
      "staleEffectiveAt",
      `effectiveAt ${command.effectiveAt} is before the tick being computed (${nextTick})`,
    );
  }

  switch (command.kind) {
    case "assignSpeed": {
      const { speed } = command.params;
      const { minSpeed, maxSpeed } = aircraft.limits;
      if (speed < minSpeed || speed > maxSpeed) {
        return reject(
          command,
          "speedOutOfLimits",
          `speed ${speed} is outside [${minSpeed}, ${maxSpeed}] for "${command.target}"`,
        );
      }
      return undefined;
    }
    case "assignAltitude": {
      const { altitude } = command.params;
      if (altitude < 0 || altitude > AIRSPACE_BOUND_MM) {
        return reject(
          command,
          "altitudeOutOfRange",
          `altitude ${altitude} is outside [0, ${AIRSPACE_BOUND_MM}]`,
        );
      }
      return undefined;
    }
    case "assignHeading": {
      const { heading } = command.params;
      if (heading < 0 || heading >= 360_000) {
        return reject(command, "headingOutOfRange", `heading ${heading} is outside [0, 360000)`);
      }
      return undefined;
    }
  }
}

export interface AdmissionScreening {
  /** Legal commands, in submission order. */
  readonly admitted: readonly MotionCommand[];
  /** Refused commands, in submission order. */
  readonly rejected: readonly CommandRejection[];
}

/**
 * Split this tick's proposals into the legal and the refused.
 *
 * One illegal command does not spoil its batch: the legal ones alongside it
 * still apply. Every submitted command lands in exactly one of the two lists —
 * nothing is dropped on the floor (spec FR-007, FR-008).
 */
export function screenCommands(
  snapshot: WorldSnapshot,
  nextTick: number,
  commands: readonly MotionCommand[],
): AdmissionScreening {
  if (commands.length === 0) return { admitted: [], rejected: [] };

  const byId = new Map(snapshot.aircraft.map((entry) => [entry.id, entry]));
  const admitted: MotionCommand[] = [];
  const rejected: CommandRejection[] = [];

  for (const command of commands) {
    const rejection = screen(command, byId.get(command.target), nextTick);
    if (rejection === undefined) admitted.push(command);
    else rejected.push(rejection);
  }

  return { admitted, rejected };
}
