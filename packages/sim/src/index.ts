// Public barrel for @model-planes/sim — the authoritative world engine.
//
// Exactly the surface described in
// docs/features/0002-aircraft-world-engine/contracts/world-engine-api.md.
// Everything here is pure and synchronous: no I/O, no clocks, no randomness.
// Nothing from `@model-planes/core` is re-exported — callers import contract
// types from core directly, so there is one definition of each.

// --- Declared rules ----------------------------------------------------------
export { RULESET_VERSION } from "./ruleset.ts";

// --- Control surface ---------------------------------------------------------
export {
  REJECTION_REASONS,
  type CommandRejection,
  type CommandSupersession,
  type MotionCommand,
  type RejectionReason,
} from "./legality.ts";

// --- World engine state ------------------------------------------------------
export {
  type AircraftAssignments,
  type WorldEngineState,
  createWorldEngineState,
} from "./world-engine-state.ts";

// --- Tick engine -------------------------------------------------------------
export {
  type TargetDimension,
  type TickOutcome,
  type WorldEngineEvent,
  advanceTick,
} from "./world-engine.ts";
