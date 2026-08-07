# Phase 0 Research: Core Contracts

Resolves the unknowns in the plan's Technical Context. Each entry records the
decision, why it was chosen, and what was rejected.

## R1 — Numeric representation and serialization determinism

- **Decision**: Store every simulation quantity as a fixed-point integer in a declared
  canonical base unit, and serialize with a canonical deterministic encoding (fixed
  field order, integers only, explicit schema-version tag). Recorded as
  [ADR 0001](../../adrs/0001-deterministic-state-representation.md).
- **Rationale**: Floating-point values format differently across runtimes and locales
  and accumulate platform-dependent drift, which would break the byte-identical trace
  the constitution requires (FR-008, SC-002, EDC-001). Integer base units make stored
  values exact, trivially comparable, and identical to serialize everywhere. The
  bounded airspace (~100 km ⇒ ~10⁸ mm) stays far inside the 2⁵³ exact-integer range,
  so plain integers suffice — no bigint, no decimal library.
- **Alternatives considered**:
  - _Floats with canonical shortest-round-trip formatting_ — serialization can be made
    deterministic, but exact equality and cross-package value stability stay fragile;
    rejected for the contract layer where values are frozen and compared for replay.
  - _Arbitrary-precision decimals / bigint everywhere_ — exact but heavier and still
    needs canonical formatting; unnecessary given the bounded magnitude range.
  - _Defer representation to `sim`_ — rejected: the record/state schema is exactly
    where values are frozen and compared, so the representation must be fixed in
    `core`.

## R2 — Schema validation approach

- **Decision**: Validate at the contract boundary with hand-written narrow validators
  (predicate/parse functions returning a typed result or a structured error), not a
  runtime schema-DSL dependency.
- **Rationale**: The contract surface is small and stable, and `core` is the dependency
  sink that must stay lightweight (the architecture names it the sink with no
  dependencies). Hand-written validators keep `core` dependency-free, keep validation
  logic colocated with the types, and make rejection of malformed/incomplete values
  (FR-011, SC-006) explicit. TypeScript `strict` + `noUncheckedIndexedAccess` already
  enforce shape at compile time; runtime validators guard the deserialization/boundary
  path.
- **Alternatives considered**:
  - _A runtime schema library (e.g. a validation DSL)_ — ergonomic, but adds a
    dependency to the sink package and couples the wire format to a third party;
    rejected for now, revisitable if the surface grows.

## R3 — Test runner

- **Decision**: Use **Vitest** (project-wide), run via each package's `test` script as
  `vitest run` under Turbo, with a shared workspace `vitest.config.ts`.
- **Rationale**: Chosen as the project's test runner. Vitest transforms TS/ESM directly
  (no separate build step for tests), so specs run against `src`; it stays provider-free
  under `pnpm verify`; and it gives watch mode, focused runs, and rich assertions for the
  determinism checks (serialize twice → byte-identical; round-trip equality). The
  cross-process byte-identical check (SC-002) is done by serializing in a spawned
  subprocess and comparing bytes. `turbo test` still `dependsOn ^build`, which is a
  no-op for the dependency sink `core`.
- **Alternatives considered**:
  - _Node built-in `node:test`_ — zero-dependency, but weaker DX (no watch/config, terser
    assertions); not chosen given the project preference for Vitest.
  - _Jest_ — mature but heavier and historically ESM-friction-prone under `nodenext`;
    rejected.

## R4 — Schema versioning scheme

- **Decision**: A single integer `schemaVersion` constant exported from `core`, stamped
  on every trace and every record; readers compare it and reject a mismatch (FR-007,
  SC-004). Bump on any change to base units, field set, or the rounding rule.
- **Rationale**: Constitution V requires the plant, prompts, action schema, and safety
  policies to be versioned; a monotonic integer is the simplest thing that lets a
  consumer detect a mismatch deterministically without semantic-version parsing.
- **Alternatives considered**:
  - _Semantic version string_ — more expressive but invites lenient "compatible-range"
    reads; a strict integer-equality check is safer for exact replay.
  - _Per-entity version numbers_ — an independent version line per entity (a
    `DecisionRecord` at v3 inside a `Trace` at v1) is more granular but more bookkeeping
    than the current surface needs. Note this is not the same as _stamping_ the single
    global version on each entity, which the Decision above does require: because every
    reader compares against the same constant, a nested tag and its enclosing document
    agree by construction, and the repetition costs nothing to maintain while keeping a
    record self-describing once lifted out of its trace.

## R5 — Observed-vs-applied time and raw→intervention→applied

- **Decision**: Every command carries `observedAt` (the snapshot timestamp it was based
  on) and `effectiveAt` (when it applies). Every decision record stores `proposed`,
  optional `intervention`, and `applied` as three distinct fields.
- **Rationale**: Directly encodes Constitution I (distinguish observed from applied
  state, FR-003) and Constitution IV (preserve the raw proposal separately from any
  intervention and the applied command, FR-005/FR-006). Keeping them as explicit
  separate fields — rather than a diff — makes attribution auditable and keeps a
  safety filter from ever making a controller look safe.
- **Alternatives considered**:
  - _Store only the applied command plus a change flag_ — rejected: loses the raw
    proposal and defeats model-vs-system attribution.

## Resolved unknowns

All Technical Context items marked NEEDS CLARIFICATION are resolved: numeric
representation and serialization (R1 → ADR 0001), validation approach (R2), test runner
(R3), versioning (R4), and the time/attribution encoding (R5). No open clarifications
remain for planning.
