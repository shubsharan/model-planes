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
} from "./validate.js";

export {
  MS_PER_TICK,
  type Mm,
  type Millideg,
  type MmPerSec,
  type Tick,
  type MillidegPerTick,
} from "./units.js";
