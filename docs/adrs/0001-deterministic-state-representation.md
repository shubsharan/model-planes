---
status: Accepted
---

# ADR: Deterministic State Representation

## Context

Constitution I requires that an identical scenario seed plus identical commands always
produce an identical, verified, byte-identical trace, and that the trace be sufficient
for exact replay. Epic 0001 makes this the foundation gate; feature 0001 (core
contracts) owns the state, command, and trace/record shapes every package stores and
exchanges.

Two platform-dependent hazards would break byte-identical replay if left to
implementation choice:

- **Number formatting.** IEEE-754 floating-point values serialize differently across
  language runtimes and locales (precision, exponent form, negative zero, `NaN`), so
  the same logical value can produce different bytes.
- **Value drift and inexact equality.** Floating-point accumulation and
  platform-dependent transcendental functions make stored values and their equality
  comparisons fragile across machines.

This choice governs every package (`core`, `sim`, `scenarios`, `controllers`,
`harness`) because they all read, write, and compare these values, and reversing it
later would force a schema migration across the whole workspace. That is Project impact
and therefore an ADR rather than a feature-local decision.

## Decision

The core contracts represent every simulation-relevant quantity as a **fixed-point
integer in a declared canonical base unit**, and serialize state, commands, and records
with a **canonical deterministic encoding**.

- Quantities are stored as integers in fixed base units — distance in millimetres,
  altitude in millimetres, angle/heading in millidegrees, speed in millimetres per
  second, time in integer ticks (with a declared milliseconds-per-tick), fuel as an
  integer in its base unit. Each quantity type declares its base unit once; no
  floating-point value is stored in state, commands, or the trace.
- The bounded terminal airspace keeps every base-unit magnitude within the exact
  integer range (a ~100 km radius is ~1.0×10⁸ mm, far below the 2⁵³ exact-integer
  limit), so ordinary integers suffice and equality is exact.
- Floating-point MAY appear only transiently inside a computation (for example, the
  simulator's dynamics); any value that enters state, a command, or the trace MUST be
  quantized to its canonical base unit at the boundary. Rounding at that boundary is
  round-half-to-even, declared and versioned.
- Serialization uses a canonical encoding: fixed field ordering (or sorted keys),
  integers only, no insignificant whitespace, and an explicit schema-version tag on
  every trace and record. Serialize→deserialize round-trips to an identical value, and
  equal values serialize to byte-identical output on every platform and process.

## Consequences

- Byte-identical traces and exact value equality become platform-independent, giving
  the replay verifier (EDC-001) a trivial, reliable equality check and satisfying
  SC-002.
- Every quantity carries a declared base unit and a resolution limit; sub-unit
  precision is deliberately unavailable, and boundary quantization is a modelled,
  versioned step rather than a hidden rounding error.
- The simulator and other packages must quantize at the contract boundary, and any
  change to a base unit or the rounding rule is a schema-version change with a
  migration — the cost that justifies fixing this decision once, up front.
- Determinism of intermediate dynamics math (e.g. transcendental functions in `sim`)
  is out of scope here; this ADR fixes only how values are represented and serialized
  in the contracts. The simulator remains responsible for deterministic computation
  before quantization.

## Supersession

**Supersedes**: None
**Superseded by**: None
