---
description: "Task list for feature: Core Contracts"
---

# Tasks: Core Contracts

- **Input**: Design documents from `docs/features/0001-core-contracts/`
- **Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)
- **Tests**: Behavioral changes require Vitest specs written and observed FAILING before implementation. This feature is entirely provider-free (no network, no model calls), so there is no separate provider-backed suite.
- **Organization**: Tasks are grouped by user story (US1–US3) so each story is independently implementable and testable.
- **Package**: `@model-planes/core` at `packages/core/` — zero runtime dependencies (the dependency sink).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1, US2, US3 (user-story phases only)
- Exact file paths are included in every task.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Wire the test harness and package scripts before any contract code.

- [X] T001 Add Vitest as a workspace dev dependency and create the shared root config `vitest.config.ts` (transforms TS/ESM directly against `src`) per [plan.md](plan.md) Testing section
- [X] T002 [P] Set the `test` script to `vitest run` in `packages/core/package.json` and confirm `packages/core/tsconfig.json` extends the base config with `strict` and `noUncheckedIndexedAccess`
- [X] T003 [P] Confirm oxlint/oxfmt configuration covers `packages/core/src` and `packages/core/test`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The governing gate and shared primitives every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Governing gate — confirm [ADR 0001](../../adrs/0001-deterministic-state-representation.md) is **Accepted** (not Proposed) before implementation proceeds; the feature cannot move from Pending to Active while the ADR is unaccepted (per [plan.md](plan.md) Architecture Decisions)
- [X] T005 Define `SCHEMA_VERSION`, the `SchemaError` type, and reusable validation-boundary guards (integer-only, range, unique-id) in `packages/core/src/validate.ts` (FR-011)
- [X] T006 [P] Define base-unit branded integer types (mm, millidegree, mm/s, tick) in `packages/core/src/units.ts` — type-level only; exact conversions are deferred to US3 (FR-009)
- [X] T007 Create the public barrel `packages/core/src/index.ts` re-exporting the surface described in [contracts/public-api.md](contracts/public-api.md); each user story appends its exports here

**Checkpoint**: Test harness green (empty), ADR accepted, shared primitives available — user stories can begin.

---

## Phase 3: User Story 1 - Read state and issue commands (Priority: P1) 🎯 MVP

**Goal**: Represent the world a controller observes (aircraft + runways) and express every supervisory decision through the shared command vocabulary — with no way to set coordinates directly, and every command carrying observed/effective time.

**Independent Test**: Construct a `WorldSnapshot`, emit one of every `CommandKind` against it, and confirm each command references only the vocabulary (never raw coordinates) and carries both `observedAt` and `effectiveAt`.

### Tests for User Story 1

> **NOTE: Write these FIRST and observe them FAIL before implementing.**

- [X] T008 [P] [US1] Failing Vitest spec `packages/core/test/vocabulary.test.ts`: build a `WorldSnapshot`, emit one of every `CommandKind`, assert each command exposes only vocabulary params (no coordinate/motion override) and carries `observedAt` + `effectiveAt` (spec US1 Independent Test; FR-002, FR-003, FR-004)
- [X] T009 [P] [US1] Failing Vitest spec `packages/core/test/state-validate.test.ts`: malformed/incomplete `AircraftState`, `RunwayState`, and `Command` values are rejected rather than defaulted (FR-011, SC-006 for these entities)

### Implementation for User Story 1

- [X] T010 [P] [US1] Implement `Vec3`/`Position`, `AircraftPerformanceLimits`, and the `AircraftClass` enum with validation in `packages/core/src/state.ts` (FR-001)
- [X] T011 [US1] Implement `AircraftState` (id, position, heading, speed, class, limits, separationRequirement, fuelOrWindowRemaining — **no `mode` field**) with validation in `packages/core/src/state.ts` (FR-001; lifecycle/clearance are derived downstream per [data-model.md](data-model.md))
- [X] T012 [US1] Implement `RunwayState` (id, `threshold1`/`threshold2`, `width`, `closed` — occupancy is **not** stored, it is derived) with validation (`threshold1 ≠ threshold2`, `width > 0`, endpoints in bounds) in `packages/core/src/state.ts` (FR-001)
- [X] T013 [US1] Implement `WorldSnapshot` (simTime ≥ 0, schemaVersion, unique aircraft/runway ids) in `packages/core/src/state.ts` (FR-001)
- [X] T014 [US1] Implement the `CommandKind` vocabulary and `Command` (kind, target, kind-specific `params`, `observedAt`, `effectiveAt`) with constructors, `params`-match-`kind` validation, and the no-coordinate invariant in `packages/core/src/command.ts` (FR-002, FR-003, FR-004)
- [X] T015 [US1] Re-export US1 types from `packages/core/src/index.ts`
- [X] T016 [US1] Run T008 and T009; confirm both now pass

**Checkpoint**: A consumer can build a snapshot and emit every command type — MVP is functional and independently testable.

---

## Phase 4: User Story 2 - Record a decision for exact replay (Priority: P2)

**Goal**: Capture one control decision in an immutable, versioned record — observed state, messages, raw proposal, intervention, applied command, result, margins, and metadata — with deterministic serialization and version-mismatch detection.

**Independent Test**: Build a `DecisionRecord`, serialize/deserialize it to an identical value, serialize the same value twice for byte-identical output, and confirm `proposed`, `intervention`, and `applied` are each separately retrievable.

### Tests for User Story 2

> **NOTE: Write these FIRST and observe them FAIL before implementing.**

- [ ] T017 [P] [US2] Failing Vitest spec `packages/core/test/serialize.test.ts`: serialize→deserialize round-trip equality, byte-identical output across repeated serializations, and version-mismatch rejection on read (SC-002, SC-004; FR-007, FR-008)
- [ ] T018 [P] [US2] Failing Vitest spec `packages/core/test/attribution.test.ts`: on a record where an intervention modified a proposal, `proposed`, `intervention`, and `applied` are all preserved and independently retrievable (SC-003; FR-006)

### Implementation for User Story 2

- [ ] T019 [P] [US2] Implement `Intervention` (enumerated reason + optional detail) in `packages/core/src/trace.ts` (FR-005, FR-006)
- [ ] T020 [US2] Implement `DecisionRecord` (observed, messages, proposed, intervention, applied, result, margins, meta) keeping proposal/intervention/applied distinct in `packages/core/src/trace.ts` (FR-005, FR-006)
- [ ] T021 [US2] Implement `Trace` (schemaVersion, seed, records ordered by simTime/index) and the `SCHEMA_VERSION` wiring in `packages/core/src/trace.ts` (FR-005, FR-007)
- [ ] T022 [US2] Implement canonical deterministic serialize/deserialize (integers only, fixed field order / sorted keys, explicit `schemaVersion`, reject-on-version-mismatch when reading) in `packages/core/src/serialize.ts` (FR-007, FR-008)
- [ ] T023 [US2] Re-export US2 types and serialization surface from `packages/core/src/index.ts`
- [ ] T024 [US2] Run T017 and T018; confirm both now pass

**Checkpoint**: Records round-trip deterministically and keep attribution separable — US1 + US2 both work independently.

---

## Phase 5: User Story 3 - Share units and reproducible seeds (Priority: P3)

**Goal**: One canonical unit system with exact boundary conversions and rejection of missing/ambiguous units, plus a seed contract deriving reproducible sub-seeds.

**Independent Test**: Convert a quantity from an alternate boundary unit and confirm it is exact; supply a quantity with no unit and confirm rejection; derive sub-seeds from a fixed seed twice and confirm identical results.

### Tests for User Story 3

> **NOTE: Write these FIRST and observe them FAIL before implementing.**

- [ ] T025 [P] [US3] Failing Vitest spec `packages/core/test/seed.test.ts`: `deriveSubSeed(label | index)` yields identical sub-seeds on repeated calls and across processes (SC-005; FR-010)
- [ ] T026 [P] [US3] Failing Vitest spec `packages/core/test/units.test.ts`: exact conversion from an alternate boundary unit, and rejection of a quantity with a missing/ambiguous unit (SC-006; FR-009)

### Implementation for User Story 3

- [ ] T027 [P] [US3] Implement exact boundary-unit conversions and missing/ambiguous-unit rejection in `packages/core/src/units.ts` (FR-009)
- [ ] T028 [P] [US3] Implement `Seed` (root) and the pure, deterministic `deriveSubSeed(label | index)` in `packages/core/src/seed.ts` (FR-010)
- [ ] T029 [US3] Re-export US3 surface (units + seeds) from `packages/core/src/index.ts`
- [ ] T030 [US3] Run T025 and T026; confirm both now pass

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story determinism coverage and the governing verification gates from [plan.md](plan.md).

- [ ] T031 [P] Add `packages/core/test/serialize-crossproc.test.ts`: serialize the same value in a separate Node process and assert byte-identical output (SC-002 across processes)
- [ ] T032 Add consolidated `packages/core/test/validate.test.ts` covering malformed-input rejection across all entities (FR-011, SC-006)
- [ ] T033 Verification gate — run `pnpm --filter @model-planes/core build && pnpm --filter @model-planes/core test` (provider-free); all Vitest specs pass
- [ ] T034 Verification gate — run `pnpm speckit:check` (workflow + link validation) and confirm spec and plan reference the same ADR
- [ ] T035 Execute [quickstart.md](quickstart.md) end-to-end as a smoke check

> **No documentation task**: [plan.md](plan.md) declares **Documentation Impact: None** (the durable decision lives in ADR 0001; `docs/architecture.md` is unchanged).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup; **blocks all user stories**. T004 (ADR accepted) gates implementation start.
- **User Stories (Phase 3–5)**: All depend on Foundational. Independent of each other — can proceed in parallel or in priority order P1 → P2 → P3.
- **Polish (Phase 6)**: Depends on the user stories being verified.

### User Story Dependencies

- **US1 (P1)**: After Foundational. No dependency on other stories.
- **US2 (P2)**: After Foundational. Serializes US1's state shapes but is independently testable with its own fixtures.
- **US3 (P3)**: After Foundational. No dependency on US1/US2.

### Within Each User Story

- Tests written and FAILING before implementation.
- Entities before the serialization/services that consume them.
- Shared file `src/state.ts` (T011–T013) and the barrel `src/index.ts` are edited sequentially within a story, not in parallel.

### Parallel Opportunities

- Setup: T002, T003 in parallel.
- Foundational: T006 in parallel with T005.
- Each story's test tasks ([P]) run together; independent-file implementation tasks marked [P] run together.
- With capacity, US1/US2/US3 can be built by different people once Foundational is done.

---

## Parallel Example: User Story 1

```bash
# Write both failing specs together:
Task: "vocabulary.test.ts — emit one of every CommandKind, assert vocabulary-only + timestamps"
Task: "state-validate.test.ts — malformed AircraftState/RunwayState/Command rejected"

# Then the independent-file model task:
Task: "Vec3/Position + AircraftPerformanceLimits + AircraftClass in src/state.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → 2. Phase 2 Foundational (ADR gate + primitives) → 3. Phase 3 US1 → **STOP and validate** US1 independently (build a snapshot, emit every command) → demo.

### Incremental Delivery

Setup + Foundational → US1 (MVP) → US2 (replayable records) → US3 (units + seeds), each tested independently before the next.

---

## Notes

- [P] = different files, no dependency on incomplete tasks.
- Every user-story task carries its [US#] label for traceability to [spec.md](spec.md).
- Verify each spec fails for the expected reason before implementing.
- Commit after each task or logical group.
- Reflects the mode-removal design: no `AircraftMode`/`RunwayMode`; occupancy, lifecycle phase, and clearance are derived downstream (see [data-model.md](data-model.md)).
