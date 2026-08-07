// The supervisory command vocabulary (FR-002, FR-003, FR-004): the only
// channel through which controller intent is expressed. No command exposes
// a way to set an aircraft's coordinates or override its motion directly —
// every command is one of the fixed CommandKind shapes below, each carrying
// the observation timestamp it was based on and the effective time it
// applies (FR-003).
import { type Millideg, type Mm, type MmPerSec, type Tick, asTick } from "./units.js";
import { type Result, err, ok, requireInteger, schemaError } from "./validate.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Kind-specific params for each command in the vocabulary (FR-002). */
interface CommandParamsMap {
  assignHeading: { readonly heading: Millideg };
  assignAltitude: { readonly altitude: Mm };
  assignSpeed: { readonly speed: MmPerSec };
  hold: Record<string, never>;
  assignRunway: { readonly runwayId: string };
  clearApproach: Record<string, never>;
  clearLand: Record<string, never>;
  goAround: Record<string, never>;
  divert: Record<string, never>;
}

export const COMMAND_KINDS = [
  "assignHeading",
  "assignAltitude",
  "assignSpeed",
  "hold",
  "assignRunway",
  "clearApproach",
  "clearLand",
  "goAround",
  "divert",
] as const satisfies readonly (keyof CommandParamsMap)[];

export type CommandKind = (typeof COMMAND_KINDS)[number];

/**
 * A single supervisory instruction from the vocabulary. `kind` discriminates
 * `params`; no `kind` carries a coordinate or motion-override field (FR-004).
 * `effectiveAt < observedAt` is representable and detectable here — whether
 * it is *legal* is the simulator's decision (spec Edge Cases).
 */
export type Command = {
  [K in CommandKind]: {
    readonly kind: K;
    readonly target: string;
    readonly params: CommandParamsMap[K];
    readonly observedAt: Tick;
    readonly effectiveAt: Tick;
  };
}[CommandKind];

function buildCommand<K extends CommandKind>(
  kind: K,
  target: string,
  params: CommandParamsMap[K],
  observedAt: Tick,
  effectiveAt: Tick,
): Command {
  return { kind, target, params, observedAt, effectiveAt } as Command;
}

const EMPTY_PARAMS: Record<string, never> = {};

export function assignHeading(
  target: string,
  heading: Millideg,
  observedAt: Tick,
  effectiveAt: Tick,
): Command {
  return buildCommand("assignHeading", target, { heading }, observedAt, effectiveAt);
}

export function assignAltitude(
  target: string,
  altitude: Mm,
  observedAt: Tick,
  effectiveAt: Tick,
): Command {
  return buildCommand("assignAltitude", target, { altitude }, observedAt, effectiveAt);
}

export function assignSpeed(
  target: string,
  speed: MmPerSec,
  observedAt: Tick,
  effectiveAt: Tick,
): Command {
  return buildCommand("assignSpeed", target, { speed }, observedAt, effectiveAt);
}

export function hold(target: string, observedAt: Tick, effectiveAt: Tick): Command {
  return buildCommand("hold", target, EMPTY_PARAMS, observedAt, effectiveAt);
}

export function assignRunway(
  target: string,
  runwayId: string,
  observedAt: Tick,
  effectiveAt: Tick,
): Command {
  return buildCommand("assignRunway", target, { runwayId }, observedAt, effectiveAt);
}

export function clearApproach(target: string, observedAt: Tick, effectiveAt: Tick): Command {
  return buildCommand("clearApproach", target, EMPTY_PARAMS, observedAt, effectiveAt);
}

export function clearLand(target: string, observedAt: Tick, effectiveAt: Tick): Command {
  return buildCommand("clearLand", target, EMPTY_PARAMS, observedAt, effectiveAt);
}

export function goAround(target: string, observedAt: Tick, effectiveAt: Tick): Command {
  return buildCommand("goAround", target, EMPTY_PARAMS, observedAt, effectiveAt);
}

export function divert(target: string, observedAt: Tick, effectiveAt: Tick): Command {
  return buildCommand("divert", target, EMPTY_PARAMS, observedAt, effectiveAt);
}

function isCommandKind(value: unknown): value is CommandKind {
  return typeof value === "string" && (COMMAND_KINDS as readonly string[]).includes(value);
}

/** Validates `params` matches exactly the field set `kind` requires — no extra fields. */
function parseParamsForKind(kind: CommandKind, field: string, input: unknown): Result<CommandParamsMap[CommandKind]> {
  if (!isRecord(input)) {
    return err(schemaError(field, "wrong-kind", `${field} must be an object`));
  }
  const keys = Object.keys(input);

  switch (kind) {
    case "assignHeading": {
      if (keys.length !== 1 || !("heading" in input)) {
        return err(schemaError(field, "wrong-kind", `${field} must be { heading }`));
      }
      const heading = requireInteger(`${field}.heading`, input["heading"]);
      if (!heading.ok) return err(heading.error);
      if (heading.value < 0 || heading.value >= 360_000) {
        return err(schemaError(`${field}.heading`, "out-of-range", `${field}.heading must be in [0, 360000)`));
      }
      return ok({ heading: heading.value as Millideg });
    }
    case "assignAltitude": {
      if (keys.length !== 1 || !("altitude" in input)) {
        return err(schemaError(field, "wrong-kind", `${field} must be { altitude }`));
      }
      const altitude = requireInteger(`${field}.altitude`, input["altitude"]);
      if (!altitude.ok) return err(altitude.error);
      if (altitude.value < 0) {
        return err(schemaError(`${field}.altitude`, "out-of-range", `${field}.altitude must be >= 0`));
      }
      return ok({ altitude: altitude.value as Mm });
    }
    case "assignSpeed": {
      if (keys.length !== 1 || !("speed" in input)) {
        return err(schemaError(field, "wrong-kind", `${field} must be { speed }`));
      }
      const speed = requireInteger(`${field}.speed`, input["speed"]);
      if (!speed.ok) return err(speed.error);
      if (speed.value < 0) {
        return err(schemaError(`${field}.speed`, "out-of-range", `${field}.speed must be >= 0`));
      }
      return ok({ speed: speed.value as MmPerSec });
    }
    case "assignRunway": {
      if (keys.length !== 1 || !("runwayId" in input)) {
        return err(schemaError(field, "wrong-kind", `${field} must be { runwayId }`));
      }
      const runwayId = input["runwayId"];
      if (typeof runwayId !== "string" || runwayId.length === 0) {
        return err(schemaError(`${field}.runwayId`, "wrong-kind", `${field}.runwayId must be a non-empty string`));
      }
      return ok({ runwayId });
    }
    case "hold":
    case "clearApproach":
    case "clearLand":
    case "goAround":
    case "divert": {
      if (keys.length !== 0) {
        return err(schemaError(field, "wrong-kind", `${field} must be an empty object for kind "${kind}"`));
      }
      return ok(EMPTY_PARAMS);
    }
  }
}

/** Validates a constructed value conforms to the Command schema (FR-011). */
export function parseCommand(input: unknown): Result<Command> {
  if (!isRecord(input)) {
    return err(schemaError("Command", "wrong-kind", "Command must be an object"));
  }

  const kind = input["kind"];
  if (!isCommandKind(kind)) {
    return err(
      schemaError("Command.kind", "wrong-kind", `Command.kind must be one of ${COMMAND_KINDS.join(", ")}`),
    );
  }

  const target = input["target"];
  if (typeof target !== "string" || target.length === 0) {
    return err(schemaError("Command.target", "wrong-kind", "Command.target must be a non-empty string"));
  }

  const params = parseParamsForKind(kind, "Command.params", input["params"]);
  if (!params.ok) return err(params.error);

  const observedAt = requireInteger("Command.observedAt", input["observedAt"]);
  if (!observedAt.ok) return err(observedAt.error);

  const effectiveAt = requireInteger("Command.effectiveAt", input["effectiveAt"]);
  if (!effectiveAt.ok) return err(effectiveAt.error);

  return ok(
    buildCommand(kind, target, params.value, asTick(observedAt.value), asTick(effectiveAt.value)),
  );
}
