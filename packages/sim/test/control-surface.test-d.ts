// The control surface is a *type-level* boundary (research R7, world-engine-api
// guarantee 6), so the test that proves it has to be a type-level test: a
// runtime suite cannot express "this does not compile". Every negative below is
// a `@ts-expect-error`, which fails the build if the code ever starts
// compiling — exactly the regression to catch if someone widens `MotionCommand`
// carelessly.
import { describe, expectTypeOf, it } from "vitest";
import {
  type Command,
  type CommandKind,
  asMillideg,
  asTick,
  assignHeading,
  assignRunway,
  clearApproach,
  clearLand,
  divert,
  goAround,
  hold,
} from "@model-planes/core";
import {
  type MotionCommand,
  type RejectionReason,
  type WorldEngineState,
  advanceTick,
  createWorldEngineState,
} from "../src/index.ts";
import { altitudeCommand, headingCommand, snapshot, speedCommand } from "./fixtures.ts";

const state: WorldEngineState = createWorldEngineState(snapshot()).unwrap();

/**
 * Narrows a core `Command` to one exact kind with a real runtime check, the
 * same way `narrowToMotion` does in the fixtures. Core's constructors are all
 * declared to return the whole `Command` union, so without this every call
 * would fail to type-check for the boring reason that `Command` is wider than
 * `MotionCommand` — the negatives below would then prove nothing about the
 * *kind*. An `as` cast would give the same static type while letting a wrong
 * type slip through unnoticed; a checked narrowing cannot.
 */
function isKind<K extends CommandKind>(
  command: Command,
  kind: K,
): command is Extract<Command, { kind: K }> {
  return command.kind === kind;
}

function commandOfKind<K extends CommandKind>(
  command: Command,
  kind: K,
): Extract<Command, { kind: K }> {
  if (!isKind(command, kind)) {
    throw new Error(`expected ${kind}, got ${command.kind}`);
  }
  return command;
}

describe("world engine control surface", () => {
  it("accepts exactly the three motion kinds", () => {
    expectTypeOf(headingCommand("AC-1", 90_000, 0, 1)).toExtend<MotionCommand>();
    expectTypeOf(altitudeCommand("AC-1", 2_000_000, 0, 1)).toExtend<MotionCommand>();
    expectTypeOf(speedCommand("AC-1", 120_000, 0, 1)).toExtend<MotionCommand>();

    expectTypeOf(advanceTick).parameter(1).toExtend<readonly MotionCommand[]>();
    advanceTick(state, [
      headingCommand("AC-1", 90_000, 0, 1),
      altitudeCommand("AC-1", 2_000_000, 0, 1),
      speedCommand("AC-1", 120_000, 0, 1),
    ]);
  });

  it("has a union of exactly three members", () => {
    expectTypeOf<MotionCommand["kind"]>().toEqualTypeOf<
      "assignHeading" | "assignAltitude" | "assignSpeed"
    >();
  });

  it("accepts a precisely-typed motion command (positive control)", () => {
    // Proves the negatives below are about the *kind* and not an artefact of
    // how `commandOfKind` types its result.
    const headingOnly: Extract<Command, { kind: "assignHeading" }> = commandOfKind(
      assignHeading("AC-1", asMillideg(90_000), asTick(0), asTick(1)),
      "assignHeading",
    );
    expectTypeOf(headingOnly).toExtend<MotionCommand>();
    advanceTick(state, [headingOnly]);
  });

  it("makes the six non-motion kinds unrepresentable", () => {
    const holdCommand: Extract<Command, { kind: "hold" }> = commandOfKind(
      hold("AC-1", asTick(0), asTick(1)),
      "hold",
    );
    // @ts-expect-error `hold` is outside the world engine's control surface (research R7)
    advanceTick(state, [holdCommand]);

    const assignRunwayCommand: Extract<Command, { kind: "assignRunway" }> = commandOfKind(
      assignRunway("AC-1", "09L", asTick(0), asTick(1)),
      "assignRunway",
    );
    // @ts-expect-error `assignRunway` is outside the world engine's control surface (research R7)
    advanceTick(state, [assignRunwayCommand]);

    const clearApproachCommand: Extract<Command, { kind: "clearApproach" }> = commandOfKind(
      clearApproach("AC-1", asTick(0), asTick(1)),
      "clearApproach",
    );
    // @ts-expect-error `clearApproach` is outside the world engine's control surface (research R7)
    advanceTick(state, [clearApproachCommand]);

    const clearLandCommand: Extract<Command, { kind: "clearLand" }> = commandOfKind(
      clearLand("AC-1", asTick(0), asTick(1)),
      "clearLand",
    );
    // @ts-expect-error `clearLand` is outside the world engine's control surface (research R7)
    advanceTick(state, [clearLandCommand]);

    const goAroundCommand: Extract<Command, { kind: "goAround" }> = commandOfKind(
      goAround("AC-1", asTick(0), asTick(1)),
      "goAround",
    );
    // @ts-expect-error `goAround` is outside the world engine's control surface (research R7)
    advanceTick(state, [goAroundCommand]);

    const divertCommand: Extract<Command, { kind: "divert" }> = commandOfKind(
      divert("AC-1", asTick(0), asTick(1)),
      "divert",
    );
    // @ts-expect-error `divert` is outside the world engine's control surface (research R7)
    advanceTick(state, [divertCommand]);
  });

  it("has no 'unsupported kind' rejection reason", () => {
    // Unsupported kinds are unrepresentable, never rejected — so correct
    // controller behaviour can never be labelled a controller error.
    expectTypeOf<RejectionReason>().toEqualTypeOf<
      | "unknownTarget"
      | "staleEffectiveAt"
      | "speedOutOfLimits"
      | "altitudeOutOfRange"
      | "headingOutOfRange"
    >();
  });
});
