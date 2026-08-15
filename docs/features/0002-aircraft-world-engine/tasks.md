# Tasks: Aircraft World Engine

- **Input**: Design documents from `docs/features/0002-aircraft-world-engine/`
- **Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/world-engine-api.md, quickstart.md
- **Tests**: Behavioral changes require Vitest tests written and observed failing before implementation.
  The entire suite is provider-free — no provider-backed tests exist in this feature.
- **Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Workspace package `packages/sim` (pnpm + turbo): sources in `packages/sim/src/`, tests in
`packages/sim/test/`, per plan.md Project Structure. Core contracts are imported from
`@model-planes/core`; localized cross-package corrections are allowed when this feature
exposes a shared invariant gap, and must carry direct core regression coverage.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Turn the `sim` scaffold into a testable package

- [X] T001 Add `vitest` devDependency and switch the `test` script to `vitest run` in `packages/sim/package.json`, then run `pnpm install` so the workspace lockfile picks it up
- [X] T002 Create `packages/sim/test/` with a trivial passing smoke test `packages/sim/test/smoke.test.ts` importing `@model-planes/core` (proves resolution of workspace dep and `.ts` ESM imports); verify `pnpm --filter @model-planes/sim test` and `check-types` pass

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Deterministic primitives every story's motion math depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Write failing Vitest suite `packages/sim/test/trig.test.ts` for deterministic trig: exact values at quadrant points (0°, 90°, 180°, 270°), quarter-wave symmetry identities across the full millidegree domain `[0, 360000)`, accuracy vs `Math.sin`/`Math.cos` within 1e-9 (tolerance only in the test — implementation must not call them), and bit-identical repeatability across calls
- [X] T004 [P] Write failing Vitest suite `packages/sim/test/world-engine-state.test.ts` for `createWorldEngineState`: wraps a valid `WorldSnapshot` fixture with empty assignments/flags; rejects a contract-invalid snapshot with the core parser's error
- [X] T005 Implement `packages/sim/src/trig.ts` — fixed minimax polynomial sin/cos over an exactly-reduced quarter wave, millidegree-integer input, basic IEEE-754 ops only, no `Math.sin`/`Math.cos`/`Math.tan` anywhere (research R1); make T003 pass
- [X] T006 [P] Implement `packages/sim/src/ruleset.ts` — exported `RULESET_VERSION = 1` plus the declared numeric rules of motion as named constants (per-tick scaling from `MS_PER_TICK`, fuel decrement of 1/tick, heading tie-break constant) with doc comments citing research R2–R4/R8
- [X] T007 Implement `packages/sim/src/world-engine-state.ts` — `WorldEngineState`, `AircraftAssignments`, `createWorldEngineState(snapshot)` validating via core `parseWorldSnapshot` (data-model.md); make T004 pass
- [X] T008 Create shared deterministic fixtures in `packages/sim/test/fixtures.ts` — builder for valid `WorldSnapshot`s (parameterized aircraft count, positions, limits) and command builders reusing core constructors; all values integer base units

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Advance the world deterministically (Priority: P1) 🎯 MVP

**Goal**: `advanceTick(state, [])` performs pure dead reckoning: position advances from
heading/speed, fuel decrements, boundary crossings clamp+flag, output snapshot is
contract-valid with simTime+1 — and identical inputs give identical output sequences.

**Independent Test**: Advance a fixture snapshot N ticks twice with empty command
streams; assert deep-equal sequences, hand-computed positions, and per-tick
`parseWorldSnapshot` validity (spec US1 acceptance scenarios).

### Tests for User Story 1 (write first, observe failing)

- [X] T009 [P] [US1] Write failing suite `packages/sim/test/determinism.test.ts`: (a) one-tick advance matches hand-computed dead-reckoning positions for cardinal and oblique headings with round-half-to-even quantization; (b) N-tick double-run deep-equality including intermediates; (c) every produced snapshot passes `parseWorldSnapshot` and `simTime` increments by exactly 1; (d) inputs are never mutated (frozen fixtures); (e) zero-aircraft world advances time only
- [X] T010 [P] [US1] Write failing cases in `packages/sim/test/events.test.ts` for US1 events: fuel window decrements 1/tick, `fuelExhausted` fires exactly once at the 0 transition and the flag persists; an aircraft heading out of bounds clamps to the boundary, raises `airspaceExited` once, and is frozen (no further motion) with all positions staying contract-valid

### Implementation for User Story 1

- [X] T011 [US1] Implement `advanceTick` core in `packages/sim/src/world-engine.ts` for the empty-command path: fixed update order (steer→move→resources→assemble, research R2), dead-reckoning position advance via `trig.ts` with boundary quantization, fuel decrement, airspace clamp+freeze, `TickOutcome` assembly with `rulesetVersion` and deterministically ordered `events` (data-model.md State transitions); make T009 and T010 pass
- [X] T012 [US1] Export the public surface from `packages/sim/src/index.ts` (replace placeholder): `RULESET_VERSION`, `MotionCommand`, `createWorldEngineState`, `advanceTick`, and the contract types per contracts/world-engine-api.md; verify `pnpm --filter @model-planes/sim check-types` passes

**Checkpoint**: Deterministic dead-reckoning world — MVP demonstrable

---

## Phase 4: User Story 2 - Command an aircraft within its performance limits (Priority: P2)

**Goal**: Motion commands (`assignHeading`, `assignAltitude`, `assignSpeed`) are admitted,
take effect exactly at `effectiveAt`, and aircraft converge to targets never exceeding
per-aircraft limits, with explicit supersession and `targetReached` events.

**Independent Test**: Script command sequences against fixture aircraft; assert per-tick
deltas never exceed limits, targets are exactly reached and held, and nothing changes
before the effective tick (spec US2 acceptance scenarios).

### Tests for User Story 2 (write first, observe failing)

- [X] T013 [P] [US2] Write failing suite `packages/sim/test/motion.test.ts`: heading converges ≤ `maxTurnRate`/tick in the shorter direction with exact snap and hold, including wrap-crossing targets and the 180000-millidegree clockwise tie-break (research R3); altitude converges ≤ climb/descent per-tick bounds, floors at 0, reaches an exact 0 target; speed steps to target at the effective tick and stays in `[minSpeed, maxSpeed]`; boundary-value assignments (exactly min/max speed) are legal; no state change before `effectiveAt`; commands of different kinds for one aircraft at one tick all apply
- [X] T014 [P] [US2] Write failing cases in `packages/sim/test/motion.test.ts` (same file, separate describe block — sequenced after T013 authored together): same-kind/same-target/same-tick duplicate resolves last-wins with an explicit `CommandSupersession` reporting both commands; `targetReached` events fire with the correct `dimension` exactly on the attaining tick

### Implementation for User Story 2

- [X] T015 [P] [US2] Implement `packages/sim/src/assignments.ts` — fold admitted commands into `AircraftAssignments` (activation at `effectiveAt`, pending queue ordered by effective tick then admission order, last-wins supersession detection) per data-model.md and research R5–R6
- [X] T016 [US2] Extend `packages/sim/src/world-engine.ts` steering to converge heading/altitude/speed toward active targets within limits (exact integer math, snap-on-arrival, `targetReached` emission) and wire admission/activation of motion commands into the tick order (depends on T015); make T013 and T014 pass

**Checkpoint**: Commanded, limit-bounded motion on top of the deterministic core

---

## Phase 5: User Story 3 - Reject what the rules forbid (Priority: P3)

**Goal**: Every forbidden command is rejected with a machine-readable reason and zero
state effect, and the world engine's control surface is exactly the three motion kinds.

**Independent Test**: Submit each rejection category and assert unchanged state, reported
reason, and that subsequent legal commands still work (spec US3 acceptance scenarios).

### Tests for User Story 3 (write first, observe failing)

- [X] T017 [P] [US3] Write failing suite `packages/sim/test/legality.test.ts`: each `RejectionReason` fires on its trigger — `unknownTarget`, `staleEffectiveAt` (`effectiveAt` < next tick), `speedOutOfLimits` (above max and below min), `altitudeOutOfRange` (above airspace ceiling; core already blocks negatives at parse), `headingOutOfRange`; rejected commands leave the world deep-equal to a no-command advance; the rejected `command` field is byte-for-byte the proposal; a legal command in the same batch still applies; every submitted command appears in exactly one of `applied`/`rejected`/`superseded`
- [X] T018 [P] [US3] Write a type-level test `packages/sim/test/control-surface.test-d.ts` (Vitest `expectTypeOf`, run via `vitest --typecheck`) asserting `advanceTick` accepts each of the three motion kinds and that each of the six non-motion kinds (`hold`, `assignRunway`, `clearApproach`, `clearLand`, `goAround`, `divert`) is a compile error when passed — the control-surface boundary is enforced by the type checker, not at runtime (research R7); enable `typecheck` in the package's Vitest config as part of this task

### Implementation for User Story 3

- [X] T019 [US3] Implement `packages/sim/src/legality.ts` — admission checks over `MotionCommand` producing `CommandRejection` values (`REJECTION_REASONS` per contracts/world-engine-api.md), and define/export the narrowed `MotionCommand` union used by `advanceTick`; make T017 and T018 pass

**Checkpoint**: All user stories independently functional — world engine is authoritative

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Performance evidence, documentation impact, and final verification gates

- [X] T020 [P] Write performance check `packages/sim/test/performance.test.ts`: advance a 50-aircraft fixture 36 000 ticks (1 simulated hour) and assert completion under a 10 s test budget, evidencing spec SC-005's < 1 min bound with margin (research R9)
- [X] T021 [P] Update `packages/sim/README.md`: remove the "Scaffold only" note; document the implemented world engine modules, the `RULESET_VERSION` policy, and what remains for later features (runway state machines, separation, replay verifier) — per plan.md Documentation Impact
- [X] T022 [P] Validate `docs/features/0002-aircraft-world-engine/quickstart.md` by executing its snippets against the built package (adjust the doc if any drift is found; it must run as written)
- [X] T023 Verify determinism guardrails: grep `packages/sim/src` for forbidden constructs (`Math.sin`, `Math.cos`, `Math.tan`, `Math.random`, `Date.now`, `performance.now`) and assert none in the state path; inspect any `packages/core/src` diff for necessity, ADR compatibility, and direct regression coverage (plan.md review boundary)
- [X] T024 Run full verification gates from plan.md: `pnpm --filter @model-planes/sim test`, `pnpm --filter @model-planes/sim check-types`, and the workspace `turbo` build/test; all green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (T005 depends on T003; T007 depends on T004; T006/T008 parallel)
- **User Stories (Phase 3–5)**: All depend on Phase 2. US2 (Phase 4) and US3 (Phase 5) both extend `world-engine.ts` from US1 (Phase 3), so US1 must land first; US2 and US3 then touch disjoint concerns (steering vs admission) but share `world-engine.ts`, so run them sequentially or coordinate merges
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Only Phase 2 — the MVP
- **US2 (P2)**: Builds on US1's `advanceTick` core; independently testable via motion suites
- **US3 (P3)**: Builds on US1's outcome assembly; independently testable via legality suites

### Within Each User Story

- Tests written and observed failing before implementation (TDD)
- State/model modules (`assignments.ts`) before engine wiring (`world-engine.ts`)
- Story complete and checkpointed before the next priority

### Parallel Opportunities

- Phase 2: T003 ∥ T004; then T005 ∥ (T006, T007) ∥ T008
- Phase 3: T009 ∥ T010 (different files)
- Phase 5: T017 ∥ T018 authoring; T020–T022 all parallel in Phase 6

---

## Parallel Example: User Story 1

```bash
# Author both failing US1 suites together (different files):
Task: "determinism suite in packages/sim/test/determinism.test.ts"
Task: "US1 event cases in packages/sim/test/events.test.ts"

# Then implement sequentially (same engine file):
Task: "advanceTick core in packages/sim/src/world-engine.ts"
Task: "public exports in packages/sim/src/index.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — deterministic trig blocks everything)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: double-run determinism + contract validity independently
5. Demo: a reproducible dead-reckoning world

### Incremental Delivery

1. Setup + Foundational → deterministic primitives proven
2. US1 → deterministic world (MVP) → validate
3. US2 → commanded, limit-bounded motion → validate
4. US3 → authoritative rejection → validate
5. Polish → performance evidence + README + quickstart validation

---

## Notes

- [P] tasks = different files, no dependencies
- Verify each test suite fails for the expected reason before implementing
- Commit after each task or logical group
- Cross-package edits are permitted when implementation exposes a shared invariant gap;
  keep them narrow, ADR-compatible, and directly tested in the owning package
