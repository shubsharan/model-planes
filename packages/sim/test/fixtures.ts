// Shared deterministic fixtures for the world engine suites (T008).
//
// Everything here is a pure builder: integer base units only (ADR 0001), no
// randomness, no clocks, no `Math` transcendentals. Two suites that build the
// "same" aircraft must get byte-identical values, otherwise a replay test
// would be asserting against a moving target.
import {
  SCHEMA_VERSION,
  type AircraftClass,
  type AircraftPerformanceLimits,
  type AircraftState,
  type Command,
  type RunwayState,
  type SeparationRequirement,
  type WorldSnapshot,
  asMillideg,
  asMillidegPerTick,
  asMm,
  asMmPerSec,
  asTick,
  assignAltitude,
  assignHeading,
  assignSpeed,
} from "@model-planes/core";

/**
 * Re-exported from the package's own control surface, not redeclared: a fixture
 * that built commands against a private copy of the type could drift from what
 * `advanceTick` actually accepts, and the suites would still compile.
 */
import type { MotionCommand } from "../src/legality.ts";

export type { MotionCommand };

// --- Declared defaults -------------------------------------------------------

/** Speeds/rates in mm/s; `maxTurnRate` in millidegrees per tick. */
export const DEFAULT_LIMITS: AircraftPerformanceLimits = {
  minSpeed: asMmPerSec(50_000),
  maxSpeed: asMmPerSec(300_000),
  maxClimbRate: asMmPerSec(20_000),
  maxDescentRate: asMmPerSec(30_000),
  maxTurnRate: asMillidegPerTick(3_000),
};

export const DEFAULT_SEPARATION: SeparationRequirement = {
  horizontal: asMm(5_000_000),
  vertical: asMm(300_000),
};

/** Fuel-or-time window, in the declared fuel unit (one unit consumed per tick). */
export const DEFAULT_FUEL = 36_000;

// --- Aircraft ----------------------------------------------------------------

export interface AircraftOverrides {
  readonly id?: string;
  readonly position?: { readonly x?: number; readonly y?: number; readonly z?: number };
  readonly heading?: number;
  readonly speed?: number;
  readonly class?: AircraftClass;
  readonly limits?: Partial<
    Record<"minSpeed" | "maxSpeed" | "maxClimbRate" | "maxDescentRate" | "maxTurnRate", number>
  >;
  readonly separationRequirement?: { readonly horizontal?: number; readonly vertical?: number };
  readonly fuelOrWindowRemaining?: number;
}

/**
 * One aircraft. Defaults: id `"AC-1"`, position `{0, 0, 1_000_000}`, heading 0,
 * speed 100_000 mm/s, class `"medium"`, `DEFAULT_LIMITS`, `DEFAULT_SEPARATION`,
 * `DEFAULT_FUEL`.
 */
export function aircraft(overrides: AircraftOverrides = {}): AircraftState {
  const position = overrides.position ?? {};
  const limits = overrides.limits ?? {};
  const separation = overrides.separationRequirement ?? {};

  return {
    id: overrides.id ?? "AC-1",
    position: {
      x: asMm(position.x ?? 0),
      y: asMm(position.y ?? 0),
      z: asMm(position.z ?? 1_000_000),
    },
    heading: asMillideg(overrides.heading ?? 0),
    speed: asMmPerSec(overrides.speed ?? 100_000),
    class: overrides.class ?? "medium",
    limits: {
      minSpeed: asMmPerSec(limits.minSpeed ?? DEFAULT_LIMITS.minSpeed),
      maxSpeed: asMmPerSec(limits.maxSpeed ?? DEFAULT_LIMITS.maxSpeed),
      maxClimbRate: asMmPerSec(limits.maxClimbRate ?? DEFAULT_LIMITS.maxClimbRate),
      maxDescentRate: asMmPerSec(limits.maxDescentRate ?? DEFAULT_LIMITS.maxDescentRate),
      maxTurnRate: asMillidegPerTick(limits.maxTurnRate ?? DEFAULT_LIMITS.maxTurnRate),
    },
    separationRequirement: {
      horizontal: asMm(separation.horizontal ?? DEFAULT_SEPARATION.horizontal),
      vertical: asMm(separation.vertical ?? DEFAULT_SEPARATION.vertical),
    },
    fuelOrWindowRemaining: overrides.fuelOrWindowRemaining ?? DEFAULT_FUEL,
  };
}

/** Columns per row of the placement grid; keeps every generated `x` in bounds. */
const GRID_COLUMNS = 100;

/** Grid pitch in mm — larger than any default separation requirement is not the
 *  point here; the only guarantee is that no two generated positions coincide. */
const GRID_PITCH_MM = 1_000_000;

/** Grid origin, so a full row stays well inside `±AIRSPACE_BOUND_MM`. */
const GRID_ORIGIN_MM = -50_000_000;

/**
 * `count` aircraft with ids `"AC-1"`..`"AC-N"` placed on a fixed integer grid so
 * no two share a position. `overrides` is applied to every aircraft on top of
 * the grid placement — passing `position` or `id` therefore collapses them all
 * onto the same value, which is the caller's choice, not an accident.
 */
export function manyAircraft(
  count: number,
  overrides: AircraftOverrides = {},
): readonly AircraftState[] {
  const built: AircraftState[] = [];
  for (let i = 0; i < count; i++) {
    built.push(
      aircraft({
        id: `AC-${i + 1}`,
        position: {
          x: GRID_ORIGIN_MM + (i % GRID_COLUMNS) * GRID_PITCH_MM,
          y: GRID_ORIGIN_MM + Math.floor(i / GRID_COLUMNS) * GRID_PITCH_MM,
        },
        ...overrides,
      }),
    );
  }
  return built;
}

// --- Runway ------------------------------------------------------------------

export function runway(
  overrides: { readonly id?: string; readonly closed?: boolean } = {},
): RunwayState {
  return {
    id: overrides.id ?? "09L",
    threshold1: { x: asMm(-2_000_000), y: asMm(0), z: asMm(0) },
    threshold2: { x: asMm(2_000_000), y: asMm(0), z: asMm(0) },
    width: asMm(45_000),
    closed: overrides.closed ?? false,
  };
}

// --- Snapshot ----------------------------------------------------------------

/** A contract-valid `WorldSnapshot`: simTime 0, one default aircraft, no runways. */
export function snapshot(
  options: {
    readonly simTime?: number;
    readonly aircraft?: readonly AircraftState[];
    readonly runways?: readonly RunwayState[];
  } = {},
): WorldSnapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    simTime: asTick(options.simTime ?? 0),
    aircraft: options.aircraft ?? [aircraft()],
    runways: options.runways ?? [],
  };
}

// --- Immutability helper -----------------------------------------------------

/**
 * Recursively freezes arrays and plain objects and returns the same reference.
 * Used to prove `advanceTick` never mutates its inputs: a write to a frozen
 * object throws under ESM strict mode rather than passing unnoticed.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

// --- Motion command builders -------------------------------------------------

/**
 * Narrows a core `Command` to the motion subset with a real runtime check. A
 * type assertion would compile away, so a builder wired to the wrong core
 * constructor would produce a mistyped fixture that no test could catch.
 */
function narrowToMotion(command: Command): MotionCommand {
  if (
    command.kind === "assignHeading" ||
    command.kind === "assignAltitude" ||
    command.kind === "assignSpeed"
  ) {
    return command;
  }
  throw new Error(`not a motion command: ${command.kind}`);
}

export function headingCommand(
  target: string,
  heading: number,
  observedAt: number,
  effectiveAt: number,
): MotionCommand {
  return narrowToMotion(
    assignHeading(target, asMillideg(heading), asTick(observedAt), asTick(effectiveAt)),
  );
}

export function altitudeCommand(
  target: string,
  altitude: number,
  observedAt: number,
  effectiveAt: number,
): MotionCommand {
  return narrowToMotion(
    assignAltitude(target, asMm(altitude), asTick(observedAt), asTick(effectiveAt)),
  );
}

export function speedCommand(
  target: string,
  speed: number,
  observedAt: number,
  effectiveAt: number,
): MotionCommand {
  return narrowToMotion(
    assignSpeed(target, asMmPerSec(speed), asTick(observedAt), asTick(effectiveAt)),
  );
}
