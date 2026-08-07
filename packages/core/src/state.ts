// Observed world state (FR-001): Vec3/Position, AircraftPerformanceLimits,
// AircraftClass, AircraftState, RunwayState, WorldSnapshot — the shape the
// simulator and controllers exchange, with runtime validation at the
// boundary (FR-011). No lifecycle/mode field: aircraft lifecycle phase and
// clearance, and runway occupancy, are derived downstream from position,
// geometry, and the command log (see data-model.md "State transitions").
import {
  SCHEMA_VERSION,
  type Result,
  err,
  ok,
  requireDeclaredConstant,
  requireInteger,
  requireRange,
  requireRecord,
  requireUniqueIds,
  schemaError,
} from "./validate.ts";
import {
  type Mm,
  type Millideg,
  type MmPerSec,
  type MillidegPerTick,
  type Tick,
  asMm,
  asMillideg,
  asMmPerSec,
  asMillidegPerTick,
  asTick,
} from "./units.ts";

/** Half-width of the bounded terminal airspace, in mm (ADR 0001: ~100 km radius). */
export const AIRSPACE_BOUND_MM = 100_000_000;

// --- AircraftClass -----------------------------------------------------------

/** Wake/separation classes used for class-dependent separation. Versioned list. */
export const AIRCRAFT_CLASSES = ["light", "medium", "heavy"] as const;
export type AircraftClass = (typeof AIRCRAFT_CLASSES)[number];

export function isAircraftClass(value: unknown): value is AircraftClass {
  return typeof value === "string" && (AIRCRAFT_CLASSES as readonly string[]).includes(value);
}

// --- Vec3 / Position -----------------------------------------------------------

/** A point in the bounded airspace; `z` is altitude (mm, >= 0). */
export interface Vec3 {
  readonly x: Mm;
  readonly y: Mm;
  readonly z: Mm;
}

export type Position = Vec3;

export function parseVec3(field: string, input: unknown): Result<Vec3> {
  const vec = requireRecord(field, input, ["x", "y", "z"]);
  if (!vec.ok) return err(vec.error);
  const record = vec.value;

  const x = requireInteger(`${field}.x`, record["x"]);
  if (!x.ok) return err(x.error);
  const y = requireInteger(`${field}.y`, record["y"]);
  if (!y.ok) return err(y.error);
  const z = requireInteger(`${field}.z`, record["z"]);
  if (!z.ok) return err(z.error);

  const xr = requireRange(`${field}.x`, x.value, -AIRSPACE_BOUND_MM, AIRSPACE_BOUND_MM);
  if (!xr.ok) return err(xr.error);
  const yr = requireRange(`${field}.y`, y.value, -AIRSPACE_BOUND_MM, AIRSPACE_BOUND_MM);
  if (!yr.ok) return err(yr.error);
  const zr = requireRange(`${field}.z`, z.value, 0, AIRSPACE_BOUND_MM);
  if (!zr.ok) return err(zr.error);

  return ok({ x: asMm(xr.value), y: asMm(yr.value), z: asMm(zr.value) });
}

function vec3Equal(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

// --- AircraftPerformanceLimits -------------------------------------------------

export interface AircraftPerformanceLimits {
  readonly minSpeed: MmPerSec;
  readonly maxSpeed: MmPerSec;
  readonly maxClimbRate: MmPerSec;
  readonly maxDescentRate: MmPerSec;
  readonly maxTurnRate: MillidegPerTick;
}

export function parseAircraftPerformanceLimits(
  field: string,
  input: unknown,
): Result<AircraftPerformanceLimits> {
  const limits = requireRecord(field, input, [
    "minSpeed",
    "maxSpeed",
    "maxClimbRate",
    "maxDescentRate",
    "maxTurnRate",
  ]);
  if (!limits.ok) return err(limits.error);
  const record = limits.value;

  const minSpeed = requireInteger(`${field}.minSpeed`, record["minSpeed"]);
  if (!minSpeed.ok) return err(minSpeed.error);
  const maxSpeed = requireInteger(`${field}.maxSpeed`, record["maxSpeed"]);
  if (!maxSpeed.ok) return err(maxSpeed.error);
  const maxClimbRate = requireInteger(`${field}.maxClimbRate`, record["maxClimbRate"]);
  if (!maxClimbRate.ok) return err(maxClimbRate.error);
  const maxDescentRate = requireInteger(`${field}.maxDescentRate`, record["maxDescentRate"]);
  if (!maxDescentRate.ok) return err(maxDescentRate.error);
  const maxTurnRate = requireInteger(`${field}.maxTurnRate`, record["maxTurnRate"]);
  if (!maxTurnRate.ok) return err(maxTurnRate.error);

  if (
    minSpeed.value < 0 ||
    maxClimbRate.value < 0 ||
    maxDescentRate.value < 0 ||
    maxTurnRate.value < 0
  ) {
    return err(schemaError(field, "out-of-range", `${field} rates and speeds must be >= 0`));
  }
  if (minSpeed.value > maxSpeed.value) {
    return err(
      schemaError(`${field}.minSpeed`, "out-of-range", `${field}.minSpeed must be <= maxSpeed`),
    );
  }

  return ok({
    minSpeed: asMmPerSec(minSpeed.value),
    maxSpeed: asMmPerSec(maxSpeed.value),
    maxClimbRate: asMmPerSec(maxClimbRate.value),
    maxDescentRate: asMmPerSec(maxDescentRate.value),
    maxTurnRate: asMillidegPerTick(maxTurnRate.value),
  });
}

// --- SeparationRequirement -------------------------------------------------

export interface SeparationRequirement {
  readonly horizontal: Mm;
  readonly vertical: Mm;
}

export function parseSeparationRequirement(
  field: string,
  input: unknown,
): Result<SeparationRequirement> {
  const separation = requireRecord(field, input, ["horizontal", "vertical"]);
  if (!separation.ok) return err(separation.error);
  const record = separation.value;

  const horizontal = requireInteger(`${field}.horizontal`, record["horizontal"]);
  if (!horizontal.ok) return err(horizontal.error);
  const vertical = requireInteger(`${field}.vertical`, record["vertical"]);
  if (!vertical.ok) return err(vertical.error);
  if (horizontal.value < 0 || vertical.value < 0) {
    return err(schemaError(field, "out-of-range", `${field} must be >= 0`));
  }
  return ok({ horizontal: asMm(horizontal.value), vertical: asMm(vertical.value) });
}

// --- AircraftState -----------------------------------------------------------

export interface AircraftState {
  readonly id: string;
  readonly position: Vec3;
  readonly heading: Millideg;
  readonly speed: MmPerSec;
  readonly class: AircraftClass;
  readonly limits: AircraftPerformanceLimits;
  readonly separationRequirement: SeparationRequirement;
  readonly fuelOrWindowRemaining: number;
}

export function parseAircraftState(field: string, input: unknown): Result<AircraftState> {
  const aircraft = requireRecord(field, input, [
    "id",
    "position",
    "heading",
    "speed",
    "class",
    "limits",
    "separationRequirement",
    "fuelOrWindowRemaining",
  ]);
  if (!aircraft.ok) return err(aircraft.error);
  const record = aircraft.value;

  const id = record["id"];
  if (typeof id !== "string" || id.length === 0) {
    return err(schemaError(`${field}.id`, "wrong-kind", `${field}.id must be a non-empty string`));
  }

  const position = parseVec3(`${field}.position`, record["position"]);
  if (!position.ok) return err(position.error);

  const heading = requireInteger(`${field}.heading`, record["heading"]);
  if (!heading.ok) return err(heading.error);
  const headingRange = requireRange(`${field}.heading`, heading.value, 0, 360_000, {
    maxExclusive: true,
  });
  if (!headingRange.ok) return err(headingRange.error);

  const speed = requireInteger(`${field}.speed`, record["speed"]);
  if (!speed.ok) return err(speed.error);

  const aircraftClass = record["class"];
  if (!isAircraftClass(aircraftClass)) {
    return err(
      schemaError(
        `${field}.class`,
        "wrong-kind",
        `${field}.class must be one of ${AIRCRAFT_CLASSES.join(", ")}`,
      ),
    );
  }

  const limits = parseAircraftPerformanceLimits(`${field}.limits`, record["limits"]);
  if (!limits.ok) return err(limits.error);

  if (speed.value < limits.value.minSpeed || speed.value > limits.value.maxSpeed) {
    return err(
      schemaError(`${field}.speed`, "out-of-range", `${field}.speed must be within limits`),
    );
  }

  const separationRequirement = parseSeparationRequirement(
    `${field}.separationRequirement`,
    record["separationRequirement"],
  );
  if (!separationRequirement.ok) return err(separationRequirement.error);

  const fuelOrWindowRemaining = requireInteger(
    `${field}.fuelOrWindowRemaining`,
    record["fuelOrWindowRemaining"],
  );
  if (!fuelOrWindowRemaining.ok) return err(fuelOrWindowRemaining.error);
  if (fuelOrWindowRemaining.value < 0) {
    return err(
      schemaError(
        `${field}.fuelOrWindowRemaining`,
        "out-of-range",
        `${field}.fuelOrWindowRemaining must be >= 0`,
      ),
    );
  }

  return ok({
    id,
    position: position.value,
    heading: asMillideg(headingRange.value),
    speed: asMmPerSec(speed.value),
    class: aircraftClass,
    limits: limits.value,
    separationRequirement: separationRequirement.value,
    fuelOrWindowRemaining: fuelOrWindowRemaining.value,
  });
}

// --- RunwayState -----------------------------------------------------------

export interface RunwayState {
  readonly id: string;
  readonly threshold1: Vec3;
  readonly threshold2: Vec3;
  readonly width: Mm;
  readonly closed: boolean;
}

export function parseRunwayState(field: string, input: unknown): Result<RunwayState> {
  const runway = requireRecord(field, input, ["id", "threshold1", "threshold2", "width", "closed"]);
  if (!runway.ok) return err(runway.error);
  const record = runway.value;

  const id = record["id"];
  if (typeof id !== "string" || id.length === 0) {
    return err(schemaError(`${field}.id`, "wrong-kind", `${field}.id must be a non-empty string`));
  }

  const threshold1 = parseVec3(`${field}.threshold1`, record["threshold1"]);
  if (!threshold1.ok) return err(threshold1.error);
  const threshold2 = parseVec3(`${field}.threshold2`, record["threshold2"]);
  if (!threshold2.ok) return err(threshold2.error);
  if (vec3Equal(threshold1.value, threshold2.value)) {
    return err(
      schemaError(field, "out-of-range", `${field}.threshold1 must differ from threshold2`),
    );
  }

  const width = requireInteger(`${field}.width`, record["width"]);
  if (!width.ok) return err(width.error);
  if (width.value <= 0) {
    return err(schemaError(`${field}.width`, "out-of-range", `${field}.width must be > 0`));
  }

  const closed = record["closed"];
  if (typeof closed !== "boolean") {
    return err(schemaError(`${field}.closed`, "wrong-kind", `${field}.closed must be a boolean`));
  }

  return ok({
    id,
    threshold1: threshold1.value,
    threshold2: threshold2.value,
    width: asMm(width.value),
    closed,
  });
}

// --- WorldSnapshot -----------------------------------------------------------

export interface WorldSnapshot {
  readonly schemaVersion: number;
  readonly simTime: Tick;
  readonly aircraft: readonly AircraftState[];
  readonly runways: readonly RunwayState[];
}

export function parseWorldSnapshot(input: unknown): Result<WorldSnapshot> {
  const snapshot = requireRecord("WorldSnapshot", input, [
    "schemaVersion",
    "simTime",
    "aircraft",
    "runways",
  ]);
  if (!snapshot.ok) return err(snapshot.error);
  const record = snapshot.value;

  const schemaVersion = requireDeclaredConstant(
    "WorldSnapshot.schemaVersion",
    record["schemaVersion"],
    SCHEMA_VERSION,
  );
  if (!schemaVersion.ok) return err(schemaVersion.error);

  const simTime = requireInteger("WorldSnapshot.simTime", record["simTime"]);
  if (!simTime.ok) return err(simTime.error);
  if (simTime.value < 0) {
    return err(
      schemaError("WorldSnapshot.simTime", "out-of-range", "WorldSnapshot.simTime must be >= 0"),
    );
  }

  const rawAircraft = record["aircraft"];
  if (!Array.isArray(rawAircraft)) {
    return err(
      schemaError(
        "WorldSnapshot.aircraft",
        "wrong-kind",
        "WorldSnapshot.aircraft must be an array",
      ),
    );
  }
  const aircraft: AircraftState[] = [];
  for (let i = 0; i < rawAircraft.length; i++) {
    const parsed = parseAircraftState(`WorldSnapshot.aircraft[${i}]`, rawAircraft[i]);
    if (!parsed.ok) return err(parsed.error);
    aircraft.push(parsed.value);
  }
  const uniqueAircraft = requireUniqueIds("WorldSnapshot.aircraft", aircraft, (a) => a.id);
  if (!uniqueAircraft.ok) return err(uniqueAircraft.error);

  const rawRunways = record["runways"];
  if (!Array.isArray(rawRunways)) {
    return err(
      schemaError("WorldSnapshot.runways", "wrong-kind", "WorldSnapshot.runways must be an array"),
    );
  }
  const runways: RunwayState[] = [];
  for (let i = 0; i < rawRunways.length; i++) {
    const parsed = parseRunwayState(`WorldSnapshot.runways[${i}]`, rawRunways[i]);
    if (!parsed.ok) return err(parsed.error);
    runways.push(parsed.value);
  }
  const uniqueRunways = requireUniqueIds("WorldSnapshot.runways", runways, (r) => r.id);
  if (!uniqueRunways.ok) return err(uniqueRunways.error);

  return ok({
    schemaVersion: schemaVersion.value,
    simTime: asTick(simTime.value),
    aircraft,
    runways,
  });
}
