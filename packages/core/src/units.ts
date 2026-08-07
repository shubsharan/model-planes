// Canonical base units (ADR 0001, data-model.md "Canonical units").
//
// Every simulation-relevant quantity is a fixed-point integer in a declared
// base unit — no floating-point value is stored in state, commands, or the
// trace. Branding these as distinct number types catches mixed-unit errors
// (e.g. passing a heading where a speed is expected) at compile time without
// any runtime cost — the brand disappears after type erasure.
import { type Result, err, ok, schemaError } from "./validate.js";

declare const brand: unique symbol;

/** A `number` distinguished at the type level as unit `B`. Erased at runtime. */
export type Branded<T, B extends string> = T & { readonly [brand]: B };

/** Distance / position / altitude, in millimetres (integer). */
export type Mm = Branded<number, "Mm">;

/** Heading / angle, in millidegrees, wraps in `[0, 360000)`. */
export type Millideg = Branded<number, "Millideg">;

/** Speed / climb / descent rate, in millimetres per second (integer, >= 0). */
export type MmPerSec = Branded<number, "MmPerSec">;

/** Simulation time, in integer ticks. */
export type Tick = Branded<number, "Tick">;

/** Turn rate, in millidegrees per tick (integer, >= 0). */
export type MillidegPerTick = Branded<number, "MillidegPerTick">;

/** Declared tick resolution: milliseconds represented by one tick. */
export const MS_PER_TICK = 100;

// --- Construction helpers ---------------------------------------------------
//
// These attach the brand without further validation; callers are expected to
// have already run the value through the `validate.ts` guards (integer,
// range) before branding it. They exist so state.ts/command.ts/trace.ts don't
// need unsafe `as` casts scattered through their construction logic.

export function asMm(value: number): Mm {
  return value as Mm;
}

export function asMillideg(value: number): Millideg {
  return value as Millideg;
}

export function asMmPerSec(value: number): MmPerSec {
  return value as MmPerSec;
}

export function asTick(value: number): Tick {
  return value as Tick;
}

export function asMillidegPerTick(value: number): MillidegPerTick {
  return value as MillidegPerTick;
}

// --- Boundary unit conversions (FR-009) -------------------------------------
//
// A quantity offered in an alternate unit at a boundary is converted to its
// canonical base unit exactly, or rejected: an unrecognized/missing unit is
// rejected outright (no implicit default unit), and a conversion that would
// lose precision (e.g. 150ms with a 100ms tick) is rejected rather than
// silently truncated (spec US3 Independent Test, SC-006).

/** A raw magnitude paired with the unit it was measured in. */
export interface Quantity {
  readonly value: number;
  readonly unit: string;
}

/** alt-to-base conversion is `value * multiplyBy / divideBy`, exact for integer input. */
interface UnitDef {
  readonly multiplyBy: number;
  readonly divideBy: number;
}

const UNIT_TABLE: Readonly<Record<string, UnitDef>> = {
  // distance / altitude — base: mm
  mm: { multiplyBy: 1, divideBy: 1 },
  m: { multiplyBy: 1_000, divideBy: 1 },
  km: { multiplyBy: 1_000_000, divideBy: 1 },
  // speed / climb / descent rate — base: mm/s
  "mm/s": { multiplyBy: 1, divideBy: 1 },
  "m/s": { multiplyBy: 1_000, divideBy: 1 },
  // heading / angle — base: millidegree
  millideg: { multiplyBy: 1, divideBy: 1 },
  deg: { multiplyBy: 1_000, divideBy: 1 },
  // time — base: tick (declared resolution MS_PER_TICK)
  tick: { multiplyBy: 1, divideBy: 1 },
  ms: { multiplyBy: 1, divideBy: MS_PER_TICK },
  // fuel / time window — base: the declared fuel unit (no alternates defined)
  fuelUnit: { multiplyBy: 1, divideBy: 1 },
};

/**
 * Convert a quantity in `quantity.unit` to its canonical integer base unit.
 * Rejects a missing unit, an unrecognized/ambiguous unit, or a conversion
 * that would not be exact (FR-009).
 */
export function toBaseUnit(quantity: Quantity): Result<number> {
  if (quantity.unit === "" || quantity.unit === undefined || quantity.unit === null) {
    return err(schemaError("unit", "missing", "quantity.unit is required — there is no implicit default unit"));
  }
  const def = UNIT_TABLE[quantity.unit];
  if (def === undefined) {
    return err(schemaError("unit", "wrong-kind", `unrecognized or ambiguous unit "${quantity.unit}"`));
  }
  if (!Number.isFinite(quantity.value)) {
    return err(schemaError("value", "not-integer", "quantity.value must be a finite number"));
  }
  const converted = (quantity.value * def.multiplyBy) / def.divideBy;
  if (!Number.isInteger(converted)) {
    return err(
      schemaError(
        "value",
        "not-integer",
        `converting ${quantity.value} ${quantity.unit} to the base unit is not exact`,
      ),
    );
  }
  return ok(converted);
}

/**
 * Convert an integer base-unit value out to `toUnit`. Exact where
 * representable — division may produce a non-integer result, which is
 * fine here since this is a boundary/display conversion, not a value
 * that re-enters state, a command, or the trace (ADR 0001).
 */
export function fromBaseUnit(value: number, toUnit: string): Result<number> {
  if (toUnit === "" || toUnit === undefined || toUnit === null) {
    return err(schemaError("unit", "missing", "toUnit is required — there is no implicit default unit"));
  }
  const def = UNIT_TABLE[toUnit];
  if (def === undefined) {
    return err(schemaError("unit", "wrong-kind", `unrecognized or ambiguous unit "${toUnit}"`));
  }
  if (!Number.isInteger(value)) {
    return err(schemaError("value", "not-integer", "a base-unit value must be an integer"));
  }
  return ok((value * def.divideBy) / def.multiplyBy);
}
