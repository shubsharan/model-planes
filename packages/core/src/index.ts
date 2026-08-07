// Public barrel for @model-planes/core — the workspace dependency sink.
// Re-exports the surface described in
// docs/features/0001-core-contracts/contracts/public-api.md. Each user story
// appends its exports here as it lands (see tasks.md T007).

// --- Foundational (validation boundary + units) -----------------------------
export {
  SCHEMA_VERSION,
  type SchemaError,
  type SchemaErrorReason,
  SchemaValidationError,
  type Result,
} from "./validate.ts";

export {
  MS_PER_TICK,
  type Mm,
  type Millideg,
  type MmPerSec,
  type Tick,
  type MillidegPerTick,
  type Quantity,
  asMm,
  asMillideg,
  asMmPerSec,
  asTick,
  asMillidegPerTick,
  fromBaseUnit,
  quantizeToBaseUnit,
  toBaseUnit,
} from "./units.ts";

// --- User Story 1: state + command vocabulary --------------------------------
export {
  AIRCRAFT_CLASSES,
  AIRSPACE_BOUND_MM,
  type AircraftClass,
  type AircraftPerformanceLimits,
  type AircraftState,
  type RunwayState,
  type SeparationRequirement,
  type Vec3,
  type Position,
  type WorldSnapshot,
  isAircraftClass,
  parseAircraftPerformanceLimits,
  parseAircraftState,
  parseRunwayState,
  parseSeparationRequirement,
  parseVec3,
  parseWorldSnapshot,
} from "./state.ts";

export {
  COMMAND_KINDS,
  type Command,
  type CommandKind,
  assignAltitude,
  assignHeading,
  assignRunway,
  assignSpeed,
  clearApproach,
  clearLand,
  divert,
  goAround,
  hold,
  parseCommand,
} from "./command.ts";

// --- User Story 2: trace/record schema + serialization -----------------------
export {
  INTERVENTION_REASONS,
  type DecisionRecord,
  type DecisionResult,
  type Intervention,
  type InterventionReason,
  type Trace,
  parseDecisionRecord,
  parseIntervention,
  parseTrace,
} from "./trace.ts";

export {
  SerializationError,
  deserialize,
  requireCanonicalRecord,
  requireCanonicalValue,
  serialize,
} from "./serialize.ts";

// --- User Story 3: units (conversions above) + seeds --------------------------
export { type Seed, deriveSubSeed, parseSeed } from "./seed.ts";
