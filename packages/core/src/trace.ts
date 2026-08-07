// Immutable, versioned trace/record schema (FR-005..007): the entry point
// that makes a run replayable and keeps model behavior attributable. The
// raw proposed command, any legality/safety intervention, and the command
// actually applied are always distinct fields — never collapsed into a
// diff — so a safety filter can never make a controller look safer than it
// was (FR-006, SC-003; research.md R5).
import { parseCommand, type Command } from "./command.ts";
import { requireCanonicalRecord, requireCanonicalValue } from "./serialize.ts";
import { parseAircraftState, parseRunwayState, parseWorldSnapshot } from "./state.ts";
import type { AircraftState, RunwayState, WorldSnapshot } from "./state.ts";
import { MS_PER_TICK } from "./units.ts";
import {
  SCHEMA_VERSION,
  err,
  ok,
  requireDeclaredConstant,
  requireInteger,
  requireRecord,
  schemaError,
  type Result,
} from "./validate.ts";

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
  const intervention = requireRecord(field, input, ["reason", "detail"]);
  if (!intervention.ok) return err(intervention.error);
  const record = intervention.value;

  const reason = record["reason"];
  if (!isInterventionReason(reason)) {
    return err(
      schemaError(
        `${field}.reason`,
        "wrong-kind",
        `${field}.reason must be one of ${INTERVENTION_REASONS.join(", ")}`,
      ),
    );
  }
  const detail = record["detail"];
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
 * margins/scoring events, and run metadata (FR-005).
 *
 * `schemaVersion` is stamped here as well as on the enclosing `Trace` (FR-007,
 * ADR 0001: "an explicit schema-version tag on every trace and record") so a
 * record lifted out of a trace — appended to a run log, replayed on its own —
 * is still self-describing. There is one global `SCHEMA_VERSION`, not a
 * per-entity version line (research.md R4), so the nested tag and its
 * enclosing document agree by construction and the repetition acts as a
 * consistency check rather than extra bookkeeping.
 *
 * `messages`, `margins`, and `meta` are opaque payloads owned by other
 * packages (FR-012). This contract does not interpret them, but it does
 * enforce that they lie in the canonical serializable value domain, so a
 * record that parses is guaranteed to persist and replay (FR-008).
 */
export interface DecisionRecord {
  readonly schemaVersion: number;
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

const DECISION_RECORD_KEYS = [
  "schemaVersion",
  "index",
  "observed",
  "messages",
  "proposed",
  "intervention",
  "applied",
  "result",
  "margins",
  "meta",
] as const;

export function parseDecisionRecord(input: unknown): Result<DecisionRecord> {
  const decisionRecord = requireRecord("DecisionRecord", input, DECISION_RECORD_KEYS);
  if (!decisionRecord.ok) return err(decisionRecord.error);
  const record = decisionRecord.value;

  const schemaVersion = requireDeclaredConstant(
    "DecisionRecord.schemaVersion",
    record["schemaVersion"],
    SCHEMA_VERSION,
  );
  if (!schemaVersion.ok) return err(schemaVersion.error);

  const index = requireInteger("DecisionRecord.index", record["index"]);
  if (!index.ok) return err(index.error);
  if (index.value < 0) {
    return err(schemaError("DecisionRecord.index", "out-of-range", "DecisionRecord.index must be >= 0"));
  }

  const observed = parseWorldSnapshot(record["observed"]);
  if (!observed.ok) return err(observed.error);

  const rawMessages = record["messages"];
  if (!Array.isArray(rawMessages)) {
    return err(schemaError("DecisionRecord.messages", "wrong-kind", "DecisionRecord.messages must be an array"));
  }
  const messages = requireCanonicalValue<readonly unknown[]>("DecisionRecord.messages", rawMessages);
  if (!messages.ok) return err(messages.error);

  const proposed = parseCommand(record["proposed"]);
  if (!proposed.ok) return err(proposed.error);

  const rawIntervention = record["intervention"];
  let intervention: Intervention | null;
  if (rawIntervention === null) {
    intervention = null;
  } else if (!("intervention" in record)) {
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

  const applied = parseCommand(record["applied"]);
  if (!applied.ok) return err(applied.error);

  const result = requireRecord("DecisionRecord.result", record["result"], ["aircraft", "runways"]);
  if (!result.ok) return err(result.error);
  const rawResult = result.value;
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

  // Opaque to this contract, but not unconstrained: validated against the
  // canonical serializable domain so a parsed record is guaranteed to persist
  // and replay, rather than failing later at serialization time.
  const margins = requireCanonicalRecord("DecisionRecord.margins", record["margins"]);
  if (!margins.ok) return err(margins.error);

  const meta = requireCanonicalRecord("DecisionRecord.meta", record["meta"]);
  if (!meta.ok) return err(meta.error);

  return ok({
    schemaVersion: schemaVersion.value,
    index: index.value,
    observed: observed.value,
    messages: messages.value,
    proposed: proposed.value,
    intervention,
    applied: applied.value,
    result: { aircraft: resultAircraft, runways: resultRunways },
    margins: margins.value,
    meta: meta.value,
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
  const trace = requireRecord("Trace", input, ["schemaVersion", "seed", "msPerTick", "records"]);
  if (!trace.ok) return err(trace.error);
  const record = trace.value;

  const schemaVersion = requireDeclaredConstant(
    "Trace.schemaVersion",
    record["schemaVersion"],
    SCHEMA_VERSION,
  );
  if (!schemaVersion.ok) return err(schemaVersion.error);

  const seed = requireRecord("Trace.seed", record["seed"], ["root"]);
  if (!seed.ok) return err(seed.error);
  const root = requireInteger("Trace.seed.root", seed.value["root"]);
  if (!root.ok) return err(root.error);

  // The tick resolution is fixed by the schema, not chosen per trace: a trace
  // declaring 200 ms would silently reinterpret every recorded timestamp. ADR
  // 0001 makes a change to the base unit a schema-version change, so any other
  // value means this data was written under a different schema.
  const msPerTick = requireDeclaredConstant("Trace.msPerTick", record["msPerTick"], MS_PER_TICK);
  if (!msPerTick.ok) return err(msPerTick.error);

  const rawRecords = record["records"];
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
