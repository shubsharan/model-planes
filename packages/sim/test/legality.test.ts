// T017: command admission — why `advanceTick` refuses a proposal, and what a
// refusal costs (spec FR-006 legality, FR-007 never-silent command accounting;
// research R6 supersession, R7 the control surface; spec User Story 3, SC-002).
//
// The declared checks run in one fixed order, and the FIRST failing check names
// the reason:
//
//   1. `unknownTarget`     — `target` names no aircraft in the snapshot.
//   2. `staleEffectiveAt`  — `effectiveAt < snapshot.simTime + 1`.
//   3. kind-specific range, against the *targeted aircraft's own* limits:
//        assignSpeed    ⇒ `speedOutOfLimits`    outside [minSpeed, maxSpeed]
//        assignAltitude ⇒ `altitudeOutOfRange`  outside [0, AIRSPACE_BOUND_MM]
//        assignHeading  ⇒ `headingOutOfRange`   outside [0, 360000)
//
// Two properties matter more than the individual cases, and each gets its own
// section below. **Reject, never clamp**: an out-of-range parameter refuses the
// whole command rather than silently trimming it to fit, so a controller can
// never be handed a value it did not ask for. **Nothing is silent**: every
// submitted command surfaces in exactly one of `applied` / `rejected` /
// `superseded`, so no proposal can vanish between submission and outcome.
//
// Every boundary here is asserted from both sides — the first illegal value and
// the last legal one — because an off-by-one in an admission rule is invisible
// from the illegal side alone.
import { describe, expect, it } from "vitest";
import { AIRSPACE_BOUND_MM, type AircraftState } from "@model-planes/core";
import { REJECTION_REASONS, type RejectionReason } from "../src/legality.ts";
import { createWorldEngineState, type WorldEngineState } from "../src/world-engine-state.ts";
import { advanceTick, type TickOutcome } from "../src/world-engine.ts";
import {
  DEFAULT_LIMITS,
  type MotionCommand,
  aircraft,
  altitudeCommand,
  deepFreeze,
  headingCommand,
  snapshot,
  speedCommand,
} from "./fixtures.ts";

// --- Local helpers -----------------------------------------------------------

/**
 * Advances one tick, unwrapping the `Result`.
 *
 * An `err` is asserted against, not merely thrown: the contract says command
 * illegality is reported as `rejected` and never as an error, so an illegal
 * proposal that reaches the motion rules and produces an off-contract snapshot
 * is itself an admission failure — and one worth naming in the output.
 */
function advance(state: WorldEngineState, commands: readonly MotionCommand[] = []): TickOutcome {
  const result = advanceTick(state, commands);
  expect(
    result.ok ? "" : `${result.error.field}: ${result.error.message}`,
    "advanceTick must reject illegal commands, not error",
  ).toBe("");
  if (!result.ok) {
    throw new Error(`advanceTick errored: ${result.error.field}: ${result.error.message}`);
  }
  return result.value;
}

/** An initial state over `fleet` at `simTime`, deep-frozen so any mutation throws. */
function stateOver(fleet: readonly AircraftState[], simTime = 0): WorldEngineState {
  const created = createWorldEngineState(deepFreeze(snapshot({ simTime, aircraft: fleet })));
  if (!created.ok) {
    throw new Error(
      `test invariant: fixture snapshot is contract-invalid: ${created.error.message}`,
    );
  }
  return created.value;
}

/** The default one-aircraft world ("AC-1") at `simTime`. */
function soloWorld(simTime = 0): WorldEngineState {
  return stateOver([aircraft()], simTime);
}

/** The earliest tick a command submitted against `state` may take effect. */
function nextTickOf(state: WorldEngineState): number {
  return state.snapshot.simTime + 1;
}

/** The aircraft `id` in an outcome's snapshot — absence is a test failure. */
function planeIn(outcome: TickOutcome, id: string): AircraftState {
  const found = outcome.state.snapshot.aircraft.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`test invariant: aircraft ${id} vanished`);
  return found;
}

/** The single rejection in an outcome — any other count is a test failure. */
function onlyRejection(outcome: TickOutcome) {
  const [first] = outcome.rejected;
  expect(outcome.rejected).toHaveLength(1);
  if (first === undefined) {
    throw new Error(`expected exactly one rejection, got ${outcome.rejected.length}`);
  }
  return first;
}

/**
 * Reasons this file actually observed. The coverage case at the end of the
 * first section asserts this equals `REJECTION_REASONS`; it starts empty, so it
 * cannot be satisfied by a run in which nothing was rejected.
 */
const triggeredReasons = new Set<RejectionReason>();

/**
 * Asserts the outcome rejected exactly one command for `reason`, applied
 * nothing, and records the reason for the coverage assertion.
 */
function expectSoleRejection(outcome: TickOutcome, reason: RejectionReason): void {
  const rejection = onlyRejection(outcome);
  expect(rejection.reason).toBe(reason);
  expect(outcome.applied).toEqual([]);
  triggeredReasons.add(rejection.reason);
}

/** Asserts nothing was refused — the legal side of a boundary. */
function expectAccepted(outcome: TickOutcome): void {
  expect(outcome.rejected).toEqual([]);
}

// --- 1. Each reason fires on its own trigger --------------------------------

describe("advanceTick rejects an illegal command for the declared reason", () => {
  it("rejects a command naming an aircraft that is not in the world", () => {
    const state = soloWorld();
    const outcome = advance(state, [
      headingCommand("AC-NOPE", 90_000, state.snapshot.simTime, nextTickOf(state)),
    ]);

    expectSoleRejection(outcome, "unknownTarget");
  });

  it("rejects a command effective one tick before the earliest legal tick", () => {
    const state = soloWorld(5);
    // nextTick is 6; effective at 5 is already in the past by the time this tick
    // is computed, so it could never have influenced motion.
    const outcome = advance(state, [headingCommand("AC-1", 90_000, 5, nextTickOf(state) - 1)]);

    expectSoleRejection(outcome, "staleEffectiveAt");
  });

  it("rejects a far-past effective time against an advanced clock", () => {
    const state = soloWorld(10);
    const outcome = advance(state, [headingCommand("AC-1", 90_000, 0, 0)]);

    expectSoleRejection(outcome, "staleEffectiveAt");
  });

  it("accepts a command effective exactly at the earliest legal tick", () => {
    const state = soloWorld(5);
    const outcome = advance(state, [headingCommand("AC-1", 90_000, 5, nextTickOf(state))]);

    // The boundary is inclusive: `effectiveAt === nextTick` is on time, not late.
    expectAccepted(outcome);
  });

  it("rejects a speed above the targeted aircraft's maximum", () => {
    const state = soloWorld();
    const outcome = advance(state, [
      speedCommand("AC-1", DEFAULT_LIMITS.maxSpeed + 1, 0, nextTickOf(state)),
    ]);

    // Rejected whole, not clamped down to maxSpeed.
    expectSoleRejection(outcome, "speedOutOfLimits");
  });

  it("rejects a speed below the targeted aircraft's minimum", () => {
    const state = soloWorld();
    const outcome = advance(state, [
      speedCommand("AC-1", DEFAULT_LIMITS.minSpeed - 1, 0, nextTickOf(state)),
    ]);

    expectSoleRejection(outcome, "speedOutOfLimits");
  });

  it("accepts speeds of exactly the minimum and exactly the maximum", () => {
    const atMin = soloWorld();
    expectAccepted(
      advance(atMin, [speedCommand("AC-1", DEFAULT_LIMITS.minSpeed, 0, nextTickOf(atMin))]),
    );

    const atMax = soloWorld();
    expectAccepted(
      advance(atMax, [speedCommand("AC-1", DEFAULT_LIMITS.maxSpeed, 0, nextTickOf(atMax))]),
    );
  });

  it("rejects an altitude above the airspace ceiling", () => {
    const state = soloWorld();
    // Only the ceiling is exercised here: core's `parseCommand` already refuses a
    // negative altitude at parse time, so a below-floor proposal cannot reach a
    // well-formed `MotionCommand` in the first place. The ceiling has no such
    // upstream guard, which makes it the case admission must own.
    const outcome = advance(state, [
      altitudeCommand("AC-1", AIRSPACE_BOUND_MM + 1, 0, nextTickOf(state)),
    ]);

    expectSoleRejection(outcome, "altitudeOutOfRange");
  });

  it("accepts altitudes of exactly the ceiling and exactly zero", () => {
    const atCeiling = soloWorld();
    expectAccepted(
      advance(atCeiling, [altitudeCommand("AC-1", AIRSPACE_BOUND_MM, 0, nextTickOf(atCeiling))]),
    );

    const atFloor = soloWorld();
    expectAccepted(advance(atFloor, [altitudeCommand("AC-1", 0, 0, nextTickOf(atFloor))]));
  });

  it("rejects a heading at the exclusive upper bound of 360000", () => {
    const state = soloWorld();
    const outcome = advance(state, [headingCommand("AC-1", 360_000, 0, nextTickOf(state))]);

    // 360000 millidegrees is 0 restated, but admission does not normalize — a
    // wrapped value would be a silent edit of the proposal.
    expectSoleRejection(outcome, "headingOutOfRange");
  });

  it("rejects a negative heading", () => {
    const state = soloWorld();
    const outcome = advance(state, [headingCommand("AC-1", -1, 0, nextTickOf(state))]);

    expectSoleRejection(outcome, "headingOutOfRange");
  });

  it("accepts headings of exactly 0 and exactly 359999", () => {
    const atZero = soloWorld();
    expectAccepted(advance(atZero, [headingCommand("AC-1", 0, 0, nextTickOf(atZero))]));

    const atTop = soloWorld();
    expectAccepted(advance(atTop, [headingCommand("AC-1", 359_999, 0, nextTickOf(atTop))]));
  });

  it("exercises every declared rejection reason", () => {
    // Guards against a reason being added to the vocabulary with no case that
    // can produce it. `triggeredReasons` starts empty, so an engine that never
    // rejects anything fails here rather than passing vacuously.
    expect([...triggeredReasons].sort()).toEqual([...REJECTION_REASONS].sort());
  });
});

// --- 2. A rejected command changes nothing ----------------------------------

describe("advanceTick applies zero state effect from rejected commands", () => {
  /**
   * Advances the same initial state twice — once with `commands`, once with none
   * — and asserts the two ticks are indistinguishable in every reported value.
   * The commands must all be rejected for this to be the right expectation.
   */
  function expectIndistinguishableFromEmptyTick(
    build: () => WorldEngineState,
    commands: readonly MotionCommand[],
  ): void {
    const withCommands = advance(build(), commands);
    const withoutCommands = advance(build());

    expect(withCommands.rejected).toHaveLength(commands.length);
    expect(withCommands.applied).toEqual([]);
    expect(withCommands.superseded).toEqual([]);

    expect(withCommands.state.snapshot).toStrictEqual(withoutCommands.state.snapshot);
    expect(withCommands.state.assignments).toStrictEqual(withoutCommands.state.assignments);
    expect(withCommands.state.exited).toStrictEqual(withoutCommands.state.exited);
    expect(withCommands.state.exhausted).toStrictEqual(withoutCommands.state.exhausted);
    expect(withCommands.events).toStrictEqual(withoutCommands.events);
  }

  it("leaves the world identical to an empty tick after out-of-range parameters", () => {
    expectIndistinguishableFromEmptyTick(
      () => soloWorld(),
      [
        speedCommand("AC-1", DEFAULT_LIMITS.maxSpeed + 1, 0, 1),
        altitudeCommand("AC-1", AIRSPACE_BOUND_MM + 1, 0, 1),
        headingCommand("AC-1", 360_000, 0, 1),
      ],
    );
  });

  it("leaves the world identical to an empty tick after unknown targets and stale times", () => {
    expectIndistinguishableFromEmptyTick(
      () => soloWorld(4),
      [headingCommand("AC-NOPE", 90_000, 4, 5), speedCommand("AC-1", 120_000, 0, 0)],
    );
  });
});

// --- 3. The reported command is the proposal, unedited ----------------------

describe("advanceTick reports the rejected proposal exactly as submitted", () => {
  it("returns the same command object it was given, not a rebuilt copy", () => {
    const state = soloWorld();
    const proposal = speedCommand("AC-1", DEFAULT_LIMITS.maxSpeed + 1, 0, nextTickOf(state));
    const snapshotOfProposal = structuredClone(proposal);

    const rejection = onlyRejection(advance(state, [proposal]));

    // Deep equality proves no field was edited; reference equality proves the
    // engine did not normalize the proposal into a look-alike.
    expect(rejection.command).toEqual(snapshotOfProposal);
    expect(rejection.command).toBe(proposal);
  });

  it("labels the rejection with a declared reason and a non-empty detail", () => {
    const state = soloWorld();
    const rejection = onlyRejection(advance(state, [headingCommand("AC-1", -1, 0, 1)]));

    expect(REJECTION_REASONS).toContain(rejection.reason);
    // `detail` is human-readable and non-normative: its presence is contractual,
    // its wording is not, so nothing here asserts what it says.
    expect(typeof rejection.detail).toBe("string");
    expect(rejection.detail.length).toBeGreaterThan(0);
  });
});

// --- 4. A rejection does not contaminate the rest of the batch --------------

describe("advanceTick applies the legal commands in a batch that also has illegal ones", () => {
  /** Asserts the legal heading applied and turned the aircraft, and the illegal one did not. */
  function expectSplit(outcome: TickOutcome, legal: MotionCommand, illegal: MotionCommand): void {
    expect(outcome.applied).toContain(legal);
    expect(outcome.rejected.map((rejection) => rejection.command)).toEqual([illegal]);
    // Applied means it moved something: the aircraft is turning toward 90000
    // rather than holding its initial heading of 0.
    expect(planeIn(outcome, "AC-1").heading).toBeGreaterThan(0);
  }

  it("applies the legal command when the illegal one is submitted first", () => {
    const state = soloWorld();
    const illegal = speedCommand("AC-1", DEFAULT_LIMITS.maxSpeed + 1, 0, nextTickOf(state));
    const legal = headingCommand("AC-1", 90_000, 0, nextTickOf(state));

    expectSplit(advance(state, [illegal, legal]), legal, illegal);
  });

  it("applies the legal command when the illegal one is submitted last", () => {
    const state = soloWorld();
    const legal = headingCommand("AC-1", 90_000, 0, nextTickOf(state));
    const illegal = speedCommand("AC-1", DEFAULT_LIMITS.maxSpeed + 1, 0, nextTickOf(state));

    expectSplit(advance(state, [legal, illegal]), legal, illegal);
  });

  it("reports multiple rejections in submission order", () => {
    const state = soloWorld();
    const first = headingCommand("AC-NOPE", 90_000, 0, nextTickOf(state));
    const second = speedCommand("AC-1", DEFAULT_LIMITS.minSpeed - 1, 0, nextTickOf(state));
    const third = altitudeCommand("AC-1", AIRSPACE_BOUND_MM + 1, 0, nextTickOf(state));

    const outcome = advance(state, [first, second, third]);

    // Submission order, not check order and not aircraft order: the controller's
    // own sequence is the only ordering that is reproducible for them.
    expect(outcome.rejected.map((rejection) => rejection.command)).toEqual([first, second, third]);
    expect(outcome.rejected.map((rejection) => rejection.reason)).toEqual([
      "unknownTarget",
      "speedOutOfLimits",
      "altitudeOutOfRange",
    ]);
  });
});

// --- 5. Nothing is silent ----------------------------------------------------

describe("advanceTick accounts for every submitted command", () => {
  it("places each submitted command in applied, rejected, or superseded", () => {
    const state = soloWorld();
    const tick = nextTickOf(state);

    const legalHeading = headingCommand("AC-1", 90_000, 0, tick);
    const illegalSpeed = speedCommand("AC-1", DEFAULT_LIMITS.maxSpeed + 1, 0, tick);
    const illegalTarget = altitudeCommand("AC-NOPE", 2_000_000, 0, tick);
    // Same kind, same aircraft, same effective tick: the earlier proposal is
    // displaced by the later one (research R6).
    const displacedAltitude = altitudeCommand("AC-1", 2_000_000, 0, tick);
    const winningAltitude = altitudeCommand("AC-1", 3_000_000, 0, tick);

    const submitted = [
      legalHeading,
      illegalSpeed,
      illegalTarget,
      displacedAltitude,
      winningAltitude,
    ];

    // Every effectiveAt equals nextTick, so no command is merely queued for a
    // future tick — each one has to be resolved by this outcome.
    const outcome = advance(state, submitted);

    // Accounting rule: a command is accounted for if it appears in `applied`, in
    // `rejected`, or on *either* side of a supersession. The winning command of a
    // supersession legitimately appears twice — once as `by`, once in `applied` —
    // so the invariant is "at least once", not "exactly once by reference count".
    // The exclusivity that must hold absolutely is applied ∩ rejected = ∅.
    const rejectedCommands = outcome.rejected.map((rejection) => rejection.command);
    const accountedFor = new Set<MotionCommand>([
      ...outcome.applied,
      ...rejectedCommands,
      ...outcome.superseded.map((pair) => pair.superseded),
      ...outcome.superseded.map((pair) => pair.by),
    ]);

    expect(submitted.filter((command) => !accountedFor.has(command))).toEqual([]);

    for (const command of outcome.applied) {
      expect(rejectedCommands).not.toContain(command);
    }

    // And the accounting is the *declared* one, not merely self-consistent.
    expect(rejectedCommands).toEqual([illegalSpeed, illegalTarget]);
    expect(outcome.superseded).toEqual([{ superseded: displacedAltitude, by: winningAltitude }]);
    expect(outcome.applied).toContain(legalHeading);
    expect(outcome.applied).toContain(winningAltitude);
    expect(outcome.applied).not.toContain(displacedAltitude);
  });
});
