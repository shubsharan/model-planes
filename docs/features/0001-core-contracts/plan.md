# Implementation Plan: Core Contracts

- **Branch**: `feature/0001-core-contracts`
- **Date**: 2026-08-06
- **Spec**: [spec.md](spec.md)
- **Input**: Feature specification from `docs/features/0001-core-contracts/spec.md`

## Summary

Define the shared, versioned contract layer in `@model-planes/core` that every other
package imports: aircraft/runway state, the supervisory command vocabulary, canonical
units, reproducible seeds, and the immutable trace/record schema. The technical
approach fixes representation for exact replay — every simulation quantity is a
fixed-point integer in a declared base unit and serialization is canonical and
deterministic ([ADR 0001](../../adrs/0001-deterministic-state-representation.md)) — with
commands carrying observed/effective time and records keeping raw proposal, intervention,
and applied command distinct. This advances epic conditions EDC-001 (byte-identical
verified traces) and EDC-003 (immutable observed-vs-applied record).

## Technical Context

- **Language/Version**: TypeScript 7.0.2, ESM (`"type": "module"`), `nodenext`; Node ≥ 25.
- **Primary Dependencies**: None at runtime (`core` is the dependency sink). Dev: `tsc --noEmit` (type-check only — Node runs `src/*.ts` directly at runtime, no compile step), oxlint/oxfmt, Vitest.
- **Storage**: N/A — in-memory contracts; serialization produces bytes consumers persist elsewhere.
- **Testing**: Vitest, run via each package's `test` script (`vitest run`) under Turbo, with a shared workspace `vitest.config.mts`. Vitest transforms TS/ESM directly, so specs run against `src`. Vitest is added as a workspace dev dependency.
- **Target Platform**: Node ≥ 25 (library, consumed in-process by workspace packages).
- **Project Type**: Library (workspace package `@model-planes/core`).
- **Performance Goals**: Not latency-bound; serialize/deserialize/validate are lightweight per-decision operations. Determinism is the hard requirement, not throughput.
- **Constraints**: Byte-identical serialization across platforms and processes; zero runtime dependencies in `core`; strict TypeScript (`strict`, `noUncheckedIndexedAccess`).
- **Scale/Scope**: The shared vocabulary for the whole benchmark — ~13 entities, one command vocabulary, one wire schema. Bounded airspace keeps all base-unit magnitudes inside the 2⁵³ exact-integer range.

_No NEEDS CLARIFICATION remain; see [research.md](research.md)._

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I — Deterministic, Replayable Simulation**: PASS. Fixed-point integers + canonical
  serialization (ADR 0001) make traces byte-identical; commands carry `observedAt` and
  `effectiveAt`; the trace/record schema is immutable and sufficient for exact replay
  (FR-003, FR-005, FR-008).
- **II — Authoritative Simulator, Advisory Controllers**: PASS. Intent flows only
  through the command vocabulary; the contract exposes no coordinate/motion override
  (FR-002, FR-004). `core` defines the command vocabulary; `sim` owns transitions and
  derives lifecycle phase/clearance (not stored on observed state).
- **III — Noncompensatory Safety**: N/A to this feature — no scoring/aggregation here.
  The record schema _carries_ separate `margins`/scoring-event fields so downstream
  safety reporting can stay noncompensatory; it does not compute or combine them.
- **IV — Model-vs-System Attribution**: PASS. `proposed`, `intervention`, and `applied`
  are distinct, independently retrievable fields on every record (FR-006, SC-003).
- **V — Reproducible Scientific Protocol**: PASS. Every trace/record carries
  `SCHEMA_VERSION`; mismatches are rejected; seeds derive reproducibly (FR-007, FR-010,
  SC-004, SC-005).
- **VI — Behavioral Constructs, No Overclaiming**: PASS. Contracts encode observable
  fields only; no human-cognition or operational-aviation claims. Base-unit values are
  representational, not asserted as physically validated (spec Non-Goals).
- **Simulation & Evidence Constraints**: PASS/deferred. Latency channels, difficulty
  dimensions, and viability oracles are owned by later packages; `core` only provides
  the seed and time vocabulary they build on.
- **Spec-Driven Delivery Gates**: PASS. Spec has prioritized, independently testable
  stories, testable FRs, measurable SCs, assumptions, and non-goals; this plan resolves
  unknowns and produces research, data-model, contracts, and quickstart.

No violations — Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
docs/features/0001-core-contracts/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── public-api.md     # exported surface (types, validation, serialize, seeds, units)
│   └── trace-schema.md   # durable trace/record wire schema
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/core/
├── package.json         # @model-planes/core (exists; exports "." -> ./src/index.ts directly)
├── tsconfig.json        # extends tsconfig.base (exists)
├── src/
│   ├── index.ts         # public barrel — re-exports the surface in contracts/public-api.md
│   ├── units.ts         # canonical base units + exact conversions (FR-009)
│   ├── seed.ts          # Seed + deriveSubSeed (FR-010)
│   ├── state.ts         # Vec3, AircraftState, RunwayState, WorldSnapshot (FR-001)
│   ├── command.ts       # CommandKind vocabulary + constructors (FR-002, FR-003, FR-004)
│   ├── trace.ts         # Intervention, DecisionRecord, Trace, SCHEMA_VERSION (FR-005..007)
│   ├── serialize.ts     # canonical deterministic serialize/deserialize (FR-008)
│   └── validate.ts      # parse/validate boundary + SchemaError (FR-011)
└── test/                # Vitest specs mirroring the SC checks in quickstart.md
    ├── serialize.test.ts    # round-trip + byte-identical + version guard (SC-002, SC-004)
    ├── attribution.test.ts  # proposed/intervention/applied retrievable (SC-003)
    ├── seed.test.ts         # deriveSubSeed stability (SC-005)
    └── validate.test.ts     # malformed input rejected (SC-006)

# workspace root (added by this feature's setup)
vitest.config.mts        # shared Vitest config
```

**Structure Decision**: Extend the existing `packages/core` scaffold in place (it is the
dependency sink defined in [architecture.md](../../architecture.md)). One module per
contract concern under `src/`, a single public barrel `src/index.ts`, and Vitest specs
under `test/`. Vitest is added as a workspace dev dependency with a shared root
`vitest.config.mts`, and `@model-planes/core`'s `test` script runs `vitest run`. No new
package, no runtime dependency in `core`.

Workspace-wide (not specific to this feature, decided during implementation): every
package's `tsc` build step was dropped in favor of running `src/*.ts` directly — the
project targets Node ≥ 25 only, is entirely unpublished (`private: true`), and Vitest
already ran specs against `src` directly from the start (see Testing above). Package
`exports`/`main`/`bin` fields point straight at `./src/index.ts`; `tsc --noEmit` (backed
by TypeScript 7's native compiler) is a pure type-check gate, with no `dist/` output and
no `tsconfig.tsbuildinfo` to track. Relative imports use real `.ts` extensions
(`allowImportingTsExtensions`) rather than the `nodenext` convention of writing `.js` to
mean a compiled sibling — since nothing compiles, that indirection no longer applies.

## Complexity Tracking

No constitution violations — nothing to justify.

## Architecture Decisions

**Impact**: Project

- [ADR 0001 — Deterministic State Representation](../../adrs/0001-deterministic-state-representation.md) (Accepted): fixed-point integer base units + canonical deterministic serialization for cross-platform byte-identical traces (FR-008, SC-002). Governs every package that stores or compares state/records.

Follows the canonical policy in [docs/adrs/README.md](../../adrs/README.md). The same ADR
is linked from [spec.md](spec.md).

## Documentation Impact

None. The durable, cross-package decision is captured in ADR 0001 (created through the
ADR flow). `docs/architecture.md` already lists `core` and the dependency graph, which
this feature does not change; per [docs/README.md](../../README.md), feature-level design
stays in this feature directory rather than being duplicated into project documents.

## Verification

- `pnpm --filter @model-planes/core build && pnpm --filter @model-planes/core test` — provider-free; Vitest specs pass. (`build` is now `tsc --noEmit`, i.e. type-check only — there is no compiled output to build.)
- Determinism contract: round-trip equality, byte-identical serialization across repeated runs and a separate process, and version-mismatch rejection (SC-002, SC-004).
- Attribution contract: every `DecisionRecord` exposes `proposed`, `intervention`, and `applied` independently (SC-003); seed derivation stable (SC-005); malformed input rejected (SC-006).
- `pnpm speckit:check` passes (workflow + link validation), and the spec/plan reference the same ADR.
