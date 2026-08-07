// Immutable, versioned trace/record schema (FR-005..007): the entry point
// that makes a run replayable and keeps model behavior attributable. The
// raw proposed command, any legality/safety intervention, and the command
// actually applied are always distinct fields — never collapsed into a
// diff — so a safety filter can never make a controller look safer than it
// was (FR-006, SC-003; research.md R5).
import { parseCommand, type Command } from "./command.ts";
import { parseAircraftState, parseRunwayState, parseWorldSnapshot } from "./state.ts";
import type { AircraftState, RunwayState, WorldSnapshot } from "./state.ts";
import { SCHEMA_VERSION, err, ok, requireInteger, schemaError, type Result } from "./validate.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// --- Intervention -----------------------------------------------------------

/** Legality/safety reasons a proposed command may be intervened on. Versioned list. */
export const INTERVENTION_REASONS = ["legality", "safety"] as const;
export type InterventionReason = (typeof INTERVENTION_REASONS)[number];

/** A legality or safety modification applied to a proposed command (FR-006). */
export interface Intervention {
  readonly reason: InterventionReason;
  readonly detail?: string;
}

function isInterventionReason(value: unknown): value is InterventionReason {
  return typeof value === "string" && (INTERVENTION_REASONS as readonly string[]).includes(value);
}

export function parseIntervention(field: string, input: unknown): Result<Intervention> {
  if (!isRecord(input)) {
    return err(schemaError(field, "wrong-kind", `${field} must be an object`));
  }
  const reason = input["reason"];
  if (!isInterventionReason(reason)) {
    return err(
      schemaError(
        `${field}.reason`,
        "wrong-kind",
        `${field}.reason must be one of ${INTERVENTION_REASONS.join(", ")}`,
      ),
    );
  }
  const detail = input["detail"];
  if (detail !== undefined && typeof detail !== "string") {
    return err(schemaError(`${field}.detail`, "wrong-kind", `${field}.detail must be a string when present`));
  }
  return ok(detail === undefined ? { reason } : { reason, detail });
}

// --- DecisionRecord -----------------------------------------------------------

/** Resulting aircraft/runway state after a decision was applied. */
export interface DecisionResult {
  readonly aircraft: readonly AircraftState[];
  readonly runways: readonly RunwayState[];
}

/**
 * The immutable per-decision entry: observed state, controller messages,
 * raw proposal, intervention, applied command, resulting state, safety
 * margins/scoring events, and run metadata (FR-005). `messages`, `margins`,
 * and `meta` are opaque payloads owned by other packages (FR-012) — this
 * contract only guarantees they round-trip through canonical serialization.
 */
export interface DecisionRecord {
  readonly index: number;
  readonly observed: WorldSnapshot;
  readonly messages: readonly unknown[];
  readonly proposed: Command;
  readonly intervention: Intervention | null;
  readonly applied: Command;
  readonly result: DecisionResult;
  readonly margins: Readonly<Record<string, unknown>>;
  readonly meta: Readonly<Record<string, unknown>>;
}

export function parseDecisionRecord(input: unknown): Result<DecisionRecord> {
  if (!isRecord(input)) {
    return err(schemaError("DecisionRecord", "wrong-kind", "DecisionRecord must be an object"));
  }

  const index = requireInteger("DecisionRecord.index", input["index"]);
  if (!index.ok) return err(index.error);
  if (index.value < 0) {
    return err(schemaError("DecisionRecord.index", "out-of-range", "DecisionRecord.index must be >= 0"));
  }

  const observed = parseWorldSnapshot(input["observed"]);
  if (!observed.ok) return err(observed.error);

  const rawMessages = input["messages"];
  if (!Array.isArray(rawMessages)) {
    return err(schemaError("DecisionRecord.messages", "wrong-kind", "DecisionRecord.messages must be an array"));
  }

  const proposed = parseCommand(input["proposed"]);
  if (!proposed.ok) return err(proposed.error);

  const rawIntervention = input["intervention"];
  let intervention: Intervention | null;
  if (rawIntervention === null) {
    intervention = null;
  } else if (!("intervention" in input)) {
    return err(
      schemaError(
        "DecisionRecord.intervention",
        "missing",
        "DecisionRecord.intervention must be present (null or an Intervention)",
      ),
    );
  } else {
    const parsedIntervention = parseIntervention("DecisionRecord.intervention", rawIntervention);
    if (!parsedIntervention.ok) return err(parsedIntervention.error);
    intervention = parsedIntervention.value;
  }

  const applied = parseCommand(input["applied"]);
  if (!applied.ok) return err(applied.error);

  const rawResult = input["result"];
  if (!isRecord(rawResult)) {
    return err(schemaError("DecisionRecord.result", "wrong-kind", "DecisionRecord.result must be an object"));
  }
  const rawResultAircraft = rawResult["aircraft"];
  if (!Array.isArray(rawResultAircraft)) {
    return err(
      schemaError("DecisionRecord.result.aircraft", "wrong-kind", "DecisionRecord.result.aircraft must be an array"),
    );
  }
  const resultAircraft: AircraftState[] = [];
  for (let i = 0; i < rawResultAircraft.length; i++) {
    const parsed = parseAircraftState(`DecisionRecord.result.aircraft[${i}]`, rawResultAircraft[i]);
    if (!parsed.ok) return err(parsed.error);
    resultAircraft.push(parsed.value);
  }
  const rawResultRunways = rawResult["runways"];
  if (!Array.isArray(rawResultRunways)) {
    return err(
      schemaError("DecisionRecord.result.runways", "wrong-kind", "DecisionRecord.result.runways must be an array"),
    );
  }
  const resultRunways: RunwayState[] = [];
  for (let i = 0; i < rawResultRunways.length; i++) {
    const parsed = parseRunwayState(`DecisionRecord.result.runways[${i}]`, rawResultRunways[i]);
    if (!parsed.ok) return err(parsed.error);
    resultRunways.push(parsed.value);
  }

  const margins = input["margins"];
  if (!isRecord(margins)) {
    return err(schemaError("DecisionRecord.margins", "wrong-kind", "DecisionRecord.margins must be an object"));
  }

  const meta = input["meta"];
  if (!isRecord(meta)) {
    return err(schemaError("DecisionRecord.meta", "wrong-kind", "DecisionRecord.meta must be an object"));
  }

  return ok({
    index: index.value,
    observed: observed.value,
    messages: rawMessages,
    proposed: proposed.value,
    intervention,
    applied: applied.value,
    result: { aircraft: resultAircraft, runways: resultRunways },
    margins,
    meta,
  });
}

// --- Trace -----------------------------------------------------------

/**
 * The ordered, versioned collection of decision records sufficient for
 * exact replay of a run (FR-005, FR-007). `seed` is intentionally shaped
 * `{ root: number }` rather than importing `Seed` from seed.ts (User Story
 * 3): the two are structurally identical, so any real `Seed` value is
 * assignable here without a forward dependency between the stories.
 */
export interface Trace {
  readonly schemaVersion: number;
  readonly seed: { readonly root: number };
  readonly msPerTick: number;
  readonly records: readonly DecisionRecord[];
}

export function parseTrace(input: unknown): Result<Trace> {
  if (!isRecord(input)) {
    return err(schemaError("Trace", "wrong-kind", "Trace must be an object"));
  }

  const schemaVersion = requireInteger("Trace.schemaVersion", input["schemaVersion"]);
  if (!schemaVersion.ok) return err(schemaVersion.error);
  if (schemaVersion.value !== SCHEMA_VERSION) {
    return err(
      schemaError(
        "Trace.schemaVersion",
        "version-mismatch",
        `expected schemaVersion ${SCHEMA_VERSION}, got ${schemaVersion.value}`,
      ),
    );
  }

  const rawSeed = input["seed"];
  if (!isRecord(rawSeed)) {
    return err(schemaError("Trace.seed", "wrong-kind", "Trace.seed must be an object"));
  }
  const root = requireInteger("Trace.seed.root", rawSeed["root"]);
  if (!root.ok) return err(root.error);

  const msPerTick = requireInteger("Trace.msPerTick", input["msPerTick"]);
  if (!msPerTick.ok) return err(msPerTick.error);
  if (msPerTick.value <= 0) {
    return err(schemaError("Trace.msPerTick", "out-of-range", "Trace.msPerTick must be > 0"));
  }

  const rawRecords = input["records"];
  if (!Array.isArray(rawRecords)) {
    return err(schemaError("Trace.records", "wrong-kind", "Trace.records must be an array"));
  }

  const records: DecisionRecord[] = [];
  let previous: readonly [number, number] | null = null; // [simTime, index]
  for (let i = 0; i < rawRecords.length; i++) {
    const parsed = parseDecisionRecord(rawRecords[i]);
    if (!parsed.ok) return err(parsed.error);
    const current: readonly [number, number] = [parsed.value.observed.simTime, parsed.value.index];
    if (previous !== null) {
      const [prevSimTime, prevIndex] = previous;
      const [simTime, index] = current;
      const outOfOrder = simTime < prevSimTime || (simTime === prevSimTime && index <= prevIndex);
      if (outOfOrder) {
        return err(
          schemaError(`Trace.records[${i}]`, "out-of-range", "Trace.records must be ordered by simTime then index"),
        );
      }
    }
    previous = current;
    records.push(parsed.value);
  }

  return ok({
    schemaVersion: schemaVersion.value,
    seed: { root: root.value },
    msPerTick: msPerTick.value,
    records,
  });
}
