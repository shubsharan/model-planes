// Deterministic sine and cosine over integer millidegrees (research R1).
//
// `Math.sin`/`Math.cos` are forbidden in the state path: IEEE-754 mandates
// correctly rounded results only for `+ - * /` (and sqrt), so a library
// transcendental may differ in the last bits between engines, platforms, and
// versions. One differing bit in a position update compounds over 36 000 ticks
// and destroys the byte-identical replay Constitution I requires.
//
// Everything below therefore uses only basic arithmetic on doubles, in a fixed
// evaluation order, from a fixed set of literal coefficients. The result is
// bit-identical wherever IEEE-754 doubles are.
//
// Structure:
//   1. Exact integer range reduction of `[0, 360000)` onto an octant `[0, 45000]`
//      — no floating-point argument reduction, so no reduction error at all.
//   2. Fixed Taylor polynomials for sin and cos on that octant, truncated well
//      past double precision (next omitted terms are ~5e-17 and ~1e-15).
//   3. Exact sign/swap reconstruction from the octant and quadrant.

/**
 * Radians per millidegree. `Math.PI` is a specified constant, not a computed
 * transcendental, and the division is correctly rounded — so this is one fixed
 * double on every platform.
 */
const RAD_PER_MILLIDEG = Math.PI / 180_000;

/** One full turn, in millidegrees. */
const FULL_TURN = 360_000;
/** One quadrant, in millidegrees. */
const QUADRANT = 90_000;
/** One octant, in millidegrees — the fold point where sin and cos swap roles. */
const OCTANT = 45_000;

// --- Polynomial coefficients -------------------------------------------------
//
// sin(x)/x and cos(x) as even series in u = x*x, evaluated by Horner. Written as
// explicit reciprocals of the factorials so the provenance of each coefficient
// is readable; each is one correctly rounded division performed once at module
// load, so the constants are identical everywhere.

const S1 = 1;
const S3 = -1 / 6;
const S5 = 1 / 120;
const S7 = -1 / 5_040;
const S9 = 1 / 362_880;
const S11 = -1 / 39_916_800;
const S13 = 1 / 6_227_020_800;
const S15 = -1 / 1_307_674_368_000;

const C0 = 1;
const C2 = -1 / 2;
const C4 = 1 / 24;
const C6 = -1 / 720;
const C8 = 1 / 40_320;
const C10 = -1 / 3_628_800;
const C12 = 1 / 479_001_600;
const C14 = -1 / 87_178_291_200;

/** sin of `x` radians, for `x` in `[0, PI/4]`. Fixed Horner order. */
function sinCore(x: number): number {
  const u = x * x;
  let p = S15;
  p = S13 + u * p;
  p = S11 + u * p;
  p = S9 + u * p;
  p = S7 + u * p;
  p = S5 + u * p;
  p = S3 + u * p;
  p = S1 + u * p;
  return x * p;
}

/** cos of `x` radians, for `x` in `[0, PI/4]`. Fixed Horner order. */
function cosCore(x: number): number {
  const u = x * x;
  let p = C14;
  p = C12 + u * p;
  p = C10 + u * p;
  p = C8 + u * p;
  p = C6 + u * p;
  p = C4 + u * p;
  p = C2 + u * p;
  return C0 + u * p;
}

/** sin and cos of the same octant-reduced angle, produced together. */
interface OctantPair {
  readonly sin: number;
  readonly cos: number;
}

/**
 * Reduce a millidegree offset within one quadrant, `[0, 90000)`, to the octant
 * `[0, 45000]` and evaluate both functions there.
 *
 * Above the fold the two swap: `sin(90° - a) === cos(a)`. Folding — rather than
 * evaluating the polynomials over the whole quadrant — is what makes the
 * quarter-wave symmetry identities hold *bit-exactly* rather than merely to
 * within a few ulp: an angle and its mirror reduce to the same core evaluation,
 * so the reconstruction below is a pure sign-and-swap of identical numbers.
 *
 * The exact fold point is special-cased because it is the one angle that is its
 * own mirror. There `sin` and `cos` are mathematically the same number, but
 * `sinCore` and `cosCore` are different polynomials and may disagree in the last
 * bit — which would break the very symmetry the fold exists to guarantee. The
 * rule declares them equal, which is true, and costs nothing in accuracy (both
 * are within one ulp of the exact value).
 */
function octantPair(withinQuadrant: number): OctantPair {
  if (withinQuadrant === OCTANT) {
    const value = sinCore(OCTANT * RAD_PER_MILLIDEG);
    return { sin: value, cos: value };
  }
  if (withinQuadrant < OCTANT) {
    const x = withinQuadrant * RAD_PER_MILLIDEG;
    return { sin: sinCore(x), cos: cosCore(x) };
  }
  const x = (QUADRANT - withinQuadrant) * RAD_PER_MILLIDEG;
  return { sin: cosCore(x), cos: sinCore(x) };
}

/**
 * Negation that never manufactures `-0`.
 *
 * Unary `-0` is `-0`, which is not a canonical value under ADR 0001 and is
 * distinguishable from `0` by `Object.is` — so `cos(90°)` would come out as a
 * value that compares unequal to zero in strict identity checks. `0 - v` is
 * exact for every double and yields `+0` for `v === 0`.
 */
function negate(value: number): number {
  return 0 - value;
}

/** Range-reduced (quadrant, offset) for any integer millidegree input. */
function reduce(millideg: number): { quadrant: number; withinQuadrant: number } {
  const wrapped = ((millideg % FULL_TURN) + FULL_TURN) % FULL_TURN;
  const withinQuadrant = wrapped % QUADRANT;
  return { quadrant: (wrapped - withinQuadrant) / QUADRANT, withinQuadrant };
}

/**
 * Sine and cosine of the same angle, from a single range reduction and a
 * single octant evaluation.
 *
 * The position update (`world-engine.ts`) needs both values for the same
 * heading every tick. Calling {@link sinMillideg} and {@link cosMillideg}
 * separately would run `reduce` twice and evaluate both Horner polynomials in
 * `octantPair` twice, discarding half of each result. This is the one
 * evaluation path; `sinMillideg`/`cosMillideg` below are sign-and-swap
 * wrappers over it, so there is no second path that could drift from this one.
 */
export function sinCosMillideg(millideg: number): OctantPair {
  const { quadrant, withinQuadrant } = reduce(millideg);
  const pair = octantPair(withinQuadrant);
  switch (quadrant) {
    case 0:
      return pair;
    case 1:
      return { sin: pair.cos, cos: negate(pair.sin) };
    case 2:
      return { sin: negate(pair.sin), cos: negate(pair.cos) };
    default:
      return { sin: negate(pair.cos), cos: pair.sin };
  }
}

/**
 * Sine of an angle given in integer millidegrees.
 *
 * Domain is the contract's `[0, 360000)`; any other integer is wrapped into it
 * first, so the function is total. Exact at the quadrant points (0, ±1) and
 * never returns `-0`.
 */
export function sinMillideg(millideg: number): number {
  return sinCosMillideg(millideg).sin;
}

/**
 * Cosine of an angle given in integer millidegrees. Same domain, exactness, and
 * signed-zero guarantees as {@link sinMillideg}.
 */
export function cosMillideg(millideg: number): number {
  return sinCosMillideg(millideg).cos;
}
