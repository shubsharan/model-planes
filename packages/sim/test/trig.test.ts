// Deterministic trigonometry over integer millidegrees (research R1).
//
// The world engine must replay byte-identically on every platform, so `sin`/`cos`
// are a fixed polynomial over a quarter-wave evaluated with only IEEE-754 basic
// operations — never `Math.sin`/`Math.cos`, whose results are not specified to the
// last bit. That is why the symmetry and repeatability suites below assert
// bit-identity (`Object.is` / `toBe`) rather than a tolerance: an implementation
// that is merely "close enough" on both sides of a quarter-wave boundary would
// diverge across hosts and break replay. The one place a tolerance is legitimate
// is the accuracy suite, where `Math.sin`/`Math.cos` serve only as an external
// oracle for the polynomial's approximation error. That is a test-only use; the
// implementation is forbidden from calling them.
import { describe, expect, it } from "vitest";
import { cosMillideg, sinMillideg } from "../src/trig.ts";

const FULL_TURN = 360_000;

// Negate via `0 - v`, not unary `-v`: unary minus maps +0 to -0, and -0 is not a
// canonical result (ADR 0001). This matches how the implementation negates, so the
// symmetry identities can be compared bit-for-bit.
const negate = (v: number): number => 0 - v;

// Dense sweep plus hand-picked angles: quadrant edges, half-quadrant edges, and the
// last representable millidegree, where wrap and quarter-wave reflection interact.
const EDGE_ANGLES = [0, 45_000, 90_000, 135_000, 180_000, 225_000, 270_000, 315_000, 359_999];

const sweepAngles = (step: number): number[] => {
  const angles: number[] = [];
  for (let md = 0; md < FULL_TURN; md += step) angles.push(md);
  return [...angles, ...EDGE_ANGLES];
};

describe("exact values at the quadrant points", () => {
  it("is exact at 0 millidegrees", () => {
    expect(sinMillideg(0)).toBe(0);
    expect(cosMillideg(0)).toBe(1);
  });

  it("is exact at 90000 millidegrees", () => {
    expect(sinMillideg(90_000)).toBe(1);
    expect(cosMillideg(90_000)).toBe(0);
  });

  it("is exact at 180000 millidegrees", () => {
    expect(sinMillideg(180_000)).toBe(0);
    expect(cosMillideg(180_000)).toBe(-1);
  });

  it("is exact at 270000 millidegrees", () => {
    expect(sinMillideg(270_000)).toBe(-1);
    expect(cosMillideg(270_000)).toBe(0);
  });

  // -0 compares equal to 0 under ===, but serializes differently and propagates a
  // sign through later multiplications, so it must never leave the module.
  it("never yields -0 at a quadrant zero", () => {
    expect(Object.is(sinMillideg(0), -0)).toBe(false);
    expect(Object.is(cosMillideg(90_000), -0)).toBe(false);
    expect(Object.is(sinMillideg(180_000), -0)).toBe(false);
    expect(Object.is(cosMillideg(270_000), -0)).toBe(false);
  });
});

describe("quarter-wave symmetry identities hold exactly", () => {
  const angles = sweepAngles(137);

  it("sin(md + 90000) equals cos(md) bit-for-bit", () => {
    for (const md of angles) {
      expect(sinMillideg((md + 90_000) % FULL_TURN)).toBe(cosMillideg(md));
    }
  });

  it("cos(md + 90000) equals -sin(md) bit-for-bit", () => {
    for (const md of angles) {
      const shifted = cosMillideg((md + 90_000) % FULL_TURN);
      expect(Object.is(shifted, negate(sinMillideg(md)))).toBe(true);
    }
  });

  it("sin(360000 - md) equals -sin(md) bit-for-bit", () => {
    for (const md of angles) {
      const reflected = sinMillideg((FULL_TURN - md) % FULL_TURN);
      expect(Object.is(reflected, negate(sinMillideg(md)))).toBe(true);
    }
  });

  it("cos(360000 - md) equals cos(md) bit-for-bit", () => {
    for (const md of angles) {
      expect(cosMillideg((FULL_TURN - md) % FULL_TURN)).toBe(cosMillideg(md));
    }
  });

  it("sin(180000 - md) equals sin(md) bit-for-bit", () => {
    for (const md of angles) {
      expect(sinMillideg((180_000 - md + FULL_TURN) % FULL_TURN)).toBe(sinMillideg(md));
    }
  });

  // The Pythagorean identity is the one symmetry that cannot be exact: s and c are
  // independently rounded, so their squares carry rounding error. 1e-12 bounds it.
  it("satisfies sin^2 + cos^2 = 1 within 1e-12", () => {
    for (const md of angles) {
      const s = sinMillideg(md);
      const c = cosMillideg(md);
      expect(Math.abs(s * s + c * c - 1)).toBeLessThan(1e-12);
    }
  });
});

describe("accuracy against the Math oracle", () => {
  // Tolerance lives only here. `Math.sin`/`Math.cos` are used as an accuracy oracle
  // for the polynomial; the implementation must not call them (research R1).
  const angles = sweepAngles(7);

  it("matches Math.sin within 1e-9 across the domain", () => {
    for (const md of angles) {
      const oracle = Math.sin((md * Math.PI) / 180_000);
      expect(Math.abs(sinMillideg(md) - oracle)).toBeLessThan(1e-9);
    }
  });

  it("matches Math.cos within 1e-9 across the domain", () => {
    for (const md of angles) {
      const oracle = Math.cos((md * Math.PI) / 180_000);
      expect(Math.abs(cosMillideg(md) - oracle)).toBeLessThan(1e-9);
    }
  });
});

describe("results are bit-identical on repeated calls", () => {
  const samples = [0, 1, 999, 45_000, 89_999, 90_000, 123_457, 180_000, 269_999, 270_000, 359_999];

  it("returns the identical value when called twice on the same input", () => {
    for (const md of samples) {
      expect(Object.is(sinMillideg(md), sinMillideg(md))).toBe(true);
      expect(Object.is(cosMillideg(md), cosMillideg(md))).toBe(true);
    }
  });

  // Interleaving other inputs would expose any cached or mutable internal state,
  // which would make the module order-dependent and thus non-replayable.
  it("is unaffected by intervening calls with other inputs", () => {
    for (const md of samples) {
      const firstSin = sinMillideg(md);
      const firstCos = cosMillideg(md);
      for (const other of samples) {
        sinMillideg(other);
        cosMillideg(other);
      }
      expect(Object.is(sinMillideg(md), firstSin)).toBe(true);
      expect(Object.is(cosMillideg(md), firstCos)).toBe(true);
    }
  });
});
