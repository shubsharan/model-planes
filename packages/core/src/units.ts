// Canonical base units (ADR 0001, data-model.md "Canonical units").
//
// Every simulation-relevant quantity is a fixed-point integer in a declared
// base unit — no floating-point value is stored in state, commands, or the
// trace. Branding these as distinct number types catches mixed-unit errors
// (e.g. passing a heading where a speed is expected) at compile time without
// any runtime cost — the brand disappears after type erasure.
//
// This module is type-level only for now: the exact boundary conversions
// (`toBaseUnit`/`fromBaseUnit`) and missing/ambiguous-unit rejection land in
// User Story 3 (FR-009, T027).

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
