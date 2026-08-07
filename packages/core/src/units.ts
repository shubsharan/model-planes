// Canonical base units (ADR 0001, data-model.md "Canonical units").
//
// Every simulation-relevant quantity is a fixed-point integer in a declared
// base unit — no floating-point value is stored in state, commands, or the
// trace. Branding these as distinct number types catches mixed-unit errors
// (e.g. passing a heading where a speed is expected) at compile time without
// any runtime cost — the brand disappears after type erasure.
import { type Result, err, ok, schemaError } from "./validate.ts";

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

/** `Number.MAX_SAFE_INTEGER`, as a `bigint`, for range-checking a final result. */
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Whether `value`'s magnitude fits in the exact-integer range ADR 0001
 * requires every base-unit magnitude to stay inside.
 */
function isSafeMagnitude(value: bigint): boolean {
  return (value < 0n ? -value : value) <= MAX_SAFE_INTEGER;
}

/**
 * The conversion as an exact rational `numerator / denominator`, in `bigint`
 * so the arithmetic below cannot overflow the way `number` arithmetic can —
 * only the final result is range-checked against ADR 0001, not every
 * intermediate.
 *
 * Scaling in binary floating point manufactures residue that has nothing to do
 * with the quantity: `1.001 * 1000` is `1000.9999999999999`, so a value that is
 * exactly 1001 mm would read as inexact. Instead we take the shortest decimal
 * that round-trips the input — which is what `String` on a double yields — and
 * work from its integer mantissa, so every step below is integer arithmetic.
 */
function asExactRatio(
  value: number,
  def: UnitDef,
): Result<{ numerator: bigint; denominator: bigint }> {
  if (!Number.isFinite(value)) {
    return err(schemaError("value", "not-integer", "quantity.value must be a finite number"));
  }

  // `value` is exactly `digits x 10^(exponent - fractionPart.length)`, where
  // `digits` is the significand with its decimal point removed. `String` emits
  // e-notation for very large and very small magnitudes, so `1e-7` and `1.001`
  // both land here; `integerPart` carries any minus sign.
  const [significand = "", exponentText] = String(value).split("e");
  const [integerPart = "", fractionPart = ""] = significand.split(".");
  const exponent = exponentText === undefined ? 0 : Number(exponentText);

  // Choose `decimals` so that `value === mantissa / 10^decimals` with an
  // integral mantissa: `shift` below is non-negative exactly when
  // `decimals >= fractionPart.length - exponent`, which is how `decimals` is
  // chosen — so `10n ** BigInt(shift)` is always a whole-number power of ten.
  const decimals = Math.max(0, fractionPart.length - exponent);
  const shift = exponent - fractionPart.length + decimals;
  const digits = BigInt(`${integerPart}${fractionPart}` || "0");
  const mantissa = digits * 10n ** BigInt(shift);

  const numerator = mantissa * BigInt(def.multiplyBy);
  const denominator = 10n ** BigInt(decimals) * BigInt(def.divideBy);
  return ok({ numerator, denominator });
}

function resolveUnit(unit: string): Result<UnitDef> {
  // `unit === undefined || unit === null` is unreachable under the `string`
  // parameter type, but this is a public library boundary a JS (non-TS)
  // caller can violate, so the runtime guard stays.
  if (unit === "" || unit === undefined || unit === null) {
    return err(
      schemaError(
        "unit",
        "missing",
        "quantity.unit is required — there is no implicit default unit",
      ),
    );
  }
  // `Object.hasOwn` — not a bare index — so a unit name that collides with an
  // `Object.prototype` member (`"toString"`, `"constructor"`, ...) is treated
  // as unrecognized rather than silently resolving to a prototype value.
  const def = Object.hasOwn(UNIT_TABLE, unit) ? UNIT_TABLE[unit] : undefined;
  if (def === undefined) {
    return err(schemaError("unit", "wrong-kind", `unrecognized or ambiguous unit "${unit}"`));
  }
  return ok(def);
}

/**
 * Convert a quantity in `quantity.unit` to its canonical integer base unit,
 * exactly. Rejects a missing unit, an unrecognized/ambiguous unit, or a
 * conversion that would lose precision — e.g. 150 ms against a 100 ms tick
 * (FR-009, SC-006). Use `quantizeToBaseUnit` where the ADR's declared boundary
 * rounding is wanted instead of rejection.
 */
export function toBaseUnit(quantity: Quantity): Result<number> {
  const def = resolveUnit(quantity.unit);
  if (!def.ok) return err(def.error);

  const ratio = asExactRatio(quantity.value, def.value);
  if (!ratio.ok) return err(ratio.error);
  const { numerator, denominator } = ratio.value;

  if (numerator % denominator !== 0n) {
    return err(
      schemaError(
        "value",
        "not-integer",
        `converting ${quantity.value} ${quantity.unit} to the base unit is not exact`,
      ),
    );
  }

  const result = numerator / denominator;
  // ADR 0001 relies on every base-unit magnitude staying inside the exact
  // integer range; past it, `number` arithmetic silently stops being exact, so
  // reject rather than return a value we cannot stand behind.
  if (!isSafeMagnitude(result)) {
    return err(
      schemaError(
        "value",
        "out-of-range",
        `converting ${quantity.value} exceeds the exact integer range (ADR 0001)`,
      ),
    );
  }
  return ok(Number(result));
}

/**
 * Convert a quantity to its canonical base unit, quantizing a sub-unit
 * remainder round-half-to-even — the declared, versioned boundary rounding
 * required by ADR 0001 for any value leaving transient floating-point
 * computation (the simulator's dynamics) to enter state, a command, or the
 * trace. Half-to-even is what makes the step reproducible across platforms and
 * unbiased over many roundings; changing it is a schema-version change.
 *
 * Unlike `toBaseUnit` this never rejects for inexactness — quantization is the
 * point. Unit and range rejections are unchanged.
 */
export function quantizeToBaseUnit(quantity: Quantity): Result<number> {
  const def = resolveUnit(quantity.unit);
  if (!def.ok) return err(def.error);

  const ratio = asExactRatio(quantity.value, def.value);
  if (!ratio.ok) return err(ratio.error);
  const { numerator, denominator } = ratio.value;

  // Quantize the magnitude, then reapply the sign: half-to-even is symmetric
  // about zero, and working on a non-negative pair keeps the floor division
  // and the parity tie-break free of sign edge cases. `bigint` division
  // truncates toward zero, which is floor division here since both operands
  // are non-negative — no float-division correction step is needed.
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const remainder = magnitude - quotient * denominator;

  const doubled = remainder * 2n;
  const rounded =
    doubled > denominator || (doubled === denominator && quotient % 2n !== 0n)
      ? quotient + 1n
      : quotient;

  // `-1 * 0` is `-0`, which is not a canonical integer (ADR 0001).
  const signed = negative && rounded !== 0n ? -rounded : rounded;

  if (!isSafeMagnitude(signed)) {
    return err(
      schemaError(
        "value",
        "out-of-range",
        `converting ${quantity.value} exceeds the exact integer range (ADR 0001)`,
      ),
    );
  }
  return ok(Number(signed));
}

/**
 * Convert an integer base-unit value out to `toUnit`. Exact where
 * representable — division may produce a non-integer result, which is
 * fine here since this is a boundary/display conversion, not a value
 * that re-enters state, a command, or the trace (ADR 0001).
 */
export function fromBaseUnit(value: number, toUnit: string): Result<number> {
  // Routed through the same `resolveUnit` as `toBaseUnit`/`quantizeToBaseUnit`
  // — a separate lookup here previously let this path resolve a unit name
  // that collides with an `Object.prototype` member and return `ok(NaN)`.
  const def = resolveUnit(toUnit);
  if (!def.ok) return err(def.error);
  if (!Number.isInteger(value)) {
    return err(schemaError("value", "not-integer", "a base-unit value must be an integer"));
  }
  return ok((value * def.value.divideBy) / def.value.multiplyBy);
}
