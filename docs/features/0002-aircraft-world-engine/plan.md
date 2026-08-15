# Implementation Plan: Aircraft World Engine

- **Branch**: `feature/0002-aircraft-world-engine`
- **Date**: 2026-08-06
- **Spec**: [spec.md](spec.md)
- **Input**: Feature specification from `docs/features/0002-aircraft-world-engine/spec.md`

## Summary

Implement the authoritative aircraft world engine in `packages/sim`: a pure, deterministic
tick engine that consumes a core-contract `WorldSnapshot` plus vocabulary `Command`s
and produces the next snapshot, applied/rejected command reports, and per-aircraft
events. Motion is simplified dead reckoning — heading, altitude, and speed converge
toward assigned targets at limit-bounded rates — computed so identical inputs give
byte-identical outputs on every platform: integer state throughout (ADR 0001), our own
polynomial trig over basic IEEE-754 operations (no `Math.sin`/`Math.cos`), and declared
round-half-to-even quantization at every state boundary.

## Technical Context

- **Language/Version**: TypeScript 5.x, ESM, `.ts`-extension imports (matches `packages/core`)
- **Primary Dependencies**: `@model-planes/core` (workspace) only; zero runtime third-party deps
- **Storage**: N/A — pure in-memory transformation; persistence belongs to trace-io (FEAT-0006)
- **Testing**: Vitest (workspace-standard; `packages/sim` currently has a placeholder test script)
- **Target Platform**: Node ≥ 20, platform-independent by construction (determinism requirement)
- **Project Type**: Library package inside the pnpm + turbo workspace
- **Performance Goals**: SC-005 — 50 aircraft × 1 h simulated (36 000 ticks at 100 ms/tick) in < 1 min wall clock
- **Constraints**: No wall-clock reads, no unseeded randomness, no `Math` transcendentals in the state path; every produced quantity is an integer base unit; inputs never mutated
- **Scale/Scope**: One new module set in `packages/sim/src` (~5 source files + tests), plus
  localized core numeric-validation corrections when required by shared invariants

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Deterministic, Replayable Simulation — PASS.** The world engine is a pure function of
  (state, commands, ruleset version); transcendental-free arithmetic and declared
  quantization make identical inputs produce identical outputs across platforms
  (research R1). Rules carry an explicit `RULESET_VERSION`. No stochastic process is
  introduced; wind/jitter hooks stay declared-but-inactive.
- **II. Authoritative Simulator, Advisory Controllers — PASS.** Controller intent
  enters only as core-contract `Command` values; there is no API that sets coordinates
  or overrides dynamics. Illegal commands are rejected with reasons, never silently
  applied (spec FR-007).
- **III. Noncompensatory Safety — N/A at this layer.** No scoring or safety reporting
  here; the tick outcome exposes the raw data (applied/rejected/events) later features
  need. Nothing in this design compensates safety with throughput.
- **IV. Model-vs-System Attribution — PASS (supporting).** The world engine reports applied
  and rejected commands distinctly and never edits a command on acceptance, preserving
  the proposed-vs-applied separation the trace contract requires.
- **V. Reproducible Scientific Protocol — PASS.** The motion/legality rules are
  versioned (`RULESET_VERSION`), published in-repo, and validated by deterministic
  tests; no provider calls anywhere.
- **VI. Behavioral Constructs, No Overclaiming — PASS.** No cognitive constructs; the
  world engine claims only explicit kinematic rules.

**Post-Phase-1 re-check**: PASS — the data model and contracts introduce no violation;
world engine assignments are derivable from the command log, so replay sufficiency (I) holds.

## Project Structure

### Documentation (this feature)

```text
docs/features/0002-aircraft-world-engine/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── world-engine-api.md  # Exported surface of the world engine
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/sim/
├── src/
│   ├── index.ts         # Public re-exports (replaces placeholder)
│   ├── ruleset.ts       # RULESET_VERSION + declared numeric rules of motion
│   ├── trig.ts          # Deterministic fixed-point sin/cos (basic IEEE ops only)
│   ├── assignments.ts   # Active per-aircraft targets: build, apply, supersede
│   ├── legality.ts      # MotionCommand union + legality → accept | reject(reason)
│   ├── world-engine.ts  # advanceTick: motion integration, events, outcome assembly
│   └── world-engine-state.ts  # WorldEngineState (snapshot + assignments), constructors, invariants
└── test/
    ├── determinism.test.ts    # US1: repeatability, byte-identity, contract validity
    ├── motion.test.ts         # US2: convergence within limits, effectiveAt, wrap
    ├── legality.test.ts       # US3: rejection categories, state untouched
    ├── control-surface.test-d.ts  # US3: non-motion kinds are compile errors
    ├── events.test.ts         # exit / exhaustion / target-reached events
    └── performance.test.ts    # SC-005 budget check
```

**Structure Decision**: All implementation lands in `packages/sim` per
`docs/architecture.md` (sim owns dynamics + tick engine, depends only on `core`).
Runway state machines, separation, and the replay verifier are later features in the
same package and are not scaffolded here. The world engine's control surface is narrowed to
the three motion command kinds (research R7): the other six are authorizations rather
than kinematic inputs, and FEAT-0003 widens the signature when it has semantics for
them.

## Complexity Tracking

No constitution violations — table not needed.

## Architecture Decisions

**Impact**: Feature

- Governed by: [Deterministic State Representation](../../adrs/0001-deterministic-state-representation.md)
  — fixes integer base units, boundary quantization, and round-half-to-even; this plan's
  trig/quantization choices (research R1–R3) implement that decision inside `sim` and are
  recorded in `research.md`, not a new ADR.

No new ADR: the world engine's internal dynamics rules are reversible, single-package design
choices; the durable cross-package commitment (state representation) already has ADR 0001.

## Documentation Impact

- `packages/sim/README.md` — remove the "scaffold only" note and record the implemented
  world engine module and its ruleset-version policy; the README owns the package's
  responsibility description per `docs/architecture.md`. `docs/architecture.md` itself
  still describes `sim` using "plant" — out of scope for this feature to change, since
  it is a durable, cross-package document, but worth a follow-up if "world engine"
  terminology is adopted project-wide.

## Verification

- `pnpm --filter @model-planes/sim test` — Vitest suites above; deterministic,
  provider-free.
- `pnpm --filter @model-planes/sim check-types` and workspace `turbo` build remain green.
- Acceptance evidence: determinism suite advances fixture snapshots twice for N ticks
  and asserts deep-equal sequences plus `parseWorldSnapshot` validity per tick (US1);
  motion suite checks per-tick deltas never exceed limits and targets are reached and
  held (US2); legality suite asserts each rejection category leaves state
  reference-equal input and reports a machine-readable reason (US3).
- Review boundary: any change under `packages/core/src` must be a localized shared-invariant
  correction, remain compatible with accepted ADRs, and carry direct core regression
  coverage. Schema evolution still goes through the owning core feature and versioning.
