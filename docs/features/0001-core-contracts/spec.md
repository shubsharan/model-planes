---
status: Pending
---

# Feature Specification: Core Contracts

- **Branch**: `feature/0001-core-contracts`
- **Epic**: [Deterministic Simulator](../../epics/0001-deterministic-simulator/epic.md)
- **Created**: 2026-08-06
- **PR**: Pending
- **Input**: User description: "Core contracts: shared versioned contract layer — state, units, seeds, command vocabulary, and immutable trace/record schema imported by every other package"

## User Scenarios & Testing _(mandatory)_

This feature is the shared vocabulary of the whole system. Its "users" are the other
workspace packages — the simulator, scenario generator, controllers, and evaluation
harness — and the developers building them. Each story is a slice of that vocabulary
that a consuming package can adopt and verify on its own.

### User Story 1 - Read state and issue commands (Priority: P1)

A consuming package can represent the world the way a controller observes it — every
aircraft's position, motion, class, performance limits, separation requirement, and
fuel or time window, plus each runway's state — and can express any supervisory
decision through a single shared command vocabulary. Every command records the moment
of the observation it was based on and the moment it takes effect, so the state the
controller saw is never confused with the state the command lands in.

**Why this priority**: Without a shared way to describe the world and to act on it,
no other package can be built. This is the minimum viable contract: with only this
story, the simulator and a scripted controller can already exchange observations and
commands.

**Independent Test**: Construct a world snapshot, emit one of every command type
against it, and confirm each command references only the shared vocabulary (never raw
coordinates) and carries both an observation timestamp and an effective time.

**Acceptance Scenarios**:

1. **Given** a world snapshot containing aircraft and runways, **When** a consumer reads it, **Then** every field the simulator and controllers need — position, heading, speed, altitude, class, performance limits, separation requirement, and fuel/time window — is available without the consumer defining its own parallel type.
2. **Given** a controller decision, **When** it is expressed as a command, **Then** the command is one of the defined supervisory types and carries the observation timestamp it was based on and the effective time at which it applies.
3. **Given** the contract layer, **When** a consumer looks for a way to set an aircraft's coordinates or override its motion directly, **Then** no such capability exists — intent can only be expressed through the command vocabulary.

---

### User Story 2 - Record a decision for exact replay (Priority: P2)

A consuming package can record everything about a single control decision in one
immutable, versioned entry: the observed state the controller was given, its messages
and tool use, the raw command it proposed, any legality or safety intervention, the
command actually applied, the resulting world state, the safety margins and scoring
events, and the provider/model/budget/latency metadata. The raw proposal, the
intervention, and the applied command are always kept separate, and the same logical
entry always serializes the same way.

**Why this priority**: This is what makes runs replayable and keeps model behavior
attributable — it directly carries epic conditions EDC-001 (identical inputs →
identical verified trace) and EDC-003 (immutable record distinguishing observed from
applied state). It builds on Story 1's state and command shapes.

**Independent Test**: Build a decision record, serialize and deserialize it to an
identical value, serialize the same value twice and confirm byte-identical output, and
confirm the raw proposed command, the intervention, and the applied command are each
separately retrievable.

**Acceptance Scenarios**:

1. **Given** a decision in which a proposed command was modified by an intervention before being applied, **When** it is recorded, **Then** the raw proposal, the intervention, and the applied command are all preserved and separately retrievable.
2. **Given** any state, command, or record value, **When** it is serialized twice — including in separate processes — **Then** the two serialized forms are byte-identical, and deserializing either reproduces a value identical to the original.
3. **Given** a trace or record, **When** a consumer inspects it, **Then** it carries an explicit schema version, and a consumer reading it under a different schema version detects the mismatch rather than misinterpreting the data.

---

### User Story 3 - Share units and reproducible seeds (Priority: P3)

Every package measures quantities in the same canonical units and draws randomness
from the same seed contract. A quantity offered in an alternate unit at a boundary is
converted exactly; a quantity with a missing or ambiguous unit is rejected. From a
single scenario seed, independent sub-seeds can be derived deterministically, so any
declared stochastic process is reproducible.

**Why this priority**: Units and seeds are the substrate that keeps Stories 1 and 2
consistent and deterministic across packages, but consumers can begin against the
state and command shapes before the full unit and seed contract is hardened.

**Independent Test**: Convert a quantity from an alternate unit to canonical form and
confirm the result is exact; supply a quantity with no unit and confirm it is
rejected; derive sub-seeds from a fixed seed twice and confirm identical results.

**Acceptance Scenarios**:

1. **Given** a quantity expressed in a canonical unit, **When** two packages exchange it, **Then** both interpret the same magnitude and unit with no implicit conversion.
2. **Given** a fixed scenario seed, **When** independent sub-seeds are derived from it, **Then** the derived seeds are identical on every run and every process.
3. **Given** a quantity with a missing or ambiguous unit, **When** it enters the contract, **Then** it is rejected rather than assumed.

---

### Edge Cases

- A command whose effective time precedes the observation time it was based on (a
  stale or back-dated command) must be representable and detectable; whether it is
  *legal* is decided by the simulator, not by this contract.
- A required state or record field that is missing or malformed must be rejected, not
  silently defaulted.
- A numeric value that could serialize differently across platforms or architectures
  must still yield a byte-identical serialized form, or the determinism guarantee is
  broken (see Assumptions on numeric representation).
- A record produced under a newer or older schema version must be detected as a
  version mismatch rather than partially read.
- An unknown command type or unknown field encountered while reading must surface as
  an explicit error, not be dropped.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The contract layer MUST define an observable world-state representation covering, per aircraft, its position, heading, speed, altitude, aircraft class, performance limits (climb, descent, turn, and speed bounds), separation requirement, and remaining fuel or time window, and MUST define per-runway state as the runway's identity, geometry (end thresholds and width), and out-of-service flag. Aircraft lifecycle phase and clearance, and runway occupancy, are derived downstream (from position, geometry, and the command log), not stored on the observed state.
- **FR-002**: The contract layer MUST define a structured supervisory command vocabulary that includes at least: assign heading, assign target altitude, assign speed, hold or continue holding, assign or change runway, clear for approach, clear to land, order go-around, and divert.
- **FR-003**: Every command MUST carry the simulation timestamp of the observed state it was based on and an effective time at which it applies, so that the observed state and the applied state are distinguishable.
- **FR-004**: The command vocabulary MUST be the only channel by which controller intent is expressed; the contract MUST NOT expose any means to set aircraft coordinates or override plant motion directly.
- **FR-005**: The contract layer MUST define an immutable, versioned trace/record schema that, for each decision, records: the observed state supplied to the controller, controller messages and tool use, the raw proposed command, any legality or safety intervention, the command actually applied, the resulting aircraft and runway state, safety margins and scoring events, and provider/model/prompt/budget/latency metadata.
- **FR-006**: The trace/record schema MUST preserve the raw proposed command separately from any intervention and from the command actually applied, each independently retrievable.
- **FR-007**: Every trace and every record MUST carry an explicit schema/version identifier, and the contract MUST let a consumer detect a version mismatch when reading data written under a different version.
- **FR-008**: Serialization of any state, command, or record MUST be deterministic — identical logical values MUST produce a byte-identical serialized form (stable ordering and canonical representation) — and a serialize-then-deserialize round trip MUST reproduce an identical value.
- **FR-009**: The contract layer MUST define canonical units for every physical quantity (distance, altitude, speed, heading, time, and fuel or time-window) and MUST convert exactly and consistently when an alternate unit is accepted at a boundary, rejecting quantities whose unit is missing or ambiguous.
- **FR-010**: The contract layer MUST define a seed representation and a deterministic method to derive independent sub-seeds from a scenario seed, so any declared stochastic process is reproducible from that seed.
- **FR-011**: The contract layer MUST validate that a constructed state, command, or record conforms to the schema and MUST reject malformed or incomplete values rather than silently accepting them.
- **FR-012**: The contract layer MUST contain only shared shapes, invariants, units, and seeds — it MUST NOT contain plant dynamics, scenario generation, scoring, or safety logic, which belong to other packages.

### Key Entities

- **Aircraft State**: one aircraft's observable condition — position, heading, speed, altitude, class, performance limits, separation requirement, and fuel/time window.
- **Runway State**: one runway's identity, geometry (end thresholds and width), and out-of-service flag. Occupancy is not stored — it is derived from aircraft positions relative to this geometry.
- **World Snapshot**: the complete observed state handed to a controller at a decision point, composed of aircraft and runway states and the simulation timestamp.
- **Command**: a single supervisory instruction from the vocabulary, carrying its observation timestamp and effective time.
- **Intervention**: a legality or safety modification applied to a proposed command, recorded distinctly from the proposal and the applied command.
- **Decision Record**: the immutable per-decision entry linking observed state, controller messages, raw proposal, intervention, applied command, resulting state, margins, scoring events, and run metadata.
- **Trace**: the ordered, versioned collection of decision records sufficient for exact replay of a run.
- **Unit**: a canonical measure for a physical quantity, with defined conversions.
- **Seed**: the reproducible randomness source from which independent sub-seeds are derived.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Every supervisory action and every observable quantity the benchmark requires can be represented using only the shared contracts; no downstream package needs a parallel definition of state, commands, or records.
- **SC-002**: Serializing then deserializing any state, command, or record reproduces an identical value in 100% of cases, and identical values serialize to byte-identical output across repeated runs and across independent processes.
- **SC-003**: On 100% of decision records, the raw proposed command, any intervention, and the applied command are separately retrievable.
- **SC-004**: 100% of traces and records carry a schema version, and a consumer reading data written under a different schema version detects the mismatch every time rather than misinterpreting it.
- **SC-005**: Deriving sub-seeds from a fixed scenario seed yields identical values on every run and every process, so any declared stochastic process is reproducible.
- **SC-006**: A malformed or incomplete state, command, or record is rejected 100% of the time rather than silently accepted or defaulted.

## Assumptions

- The contract layer is a library consumed in-process by the other workspace packages (function-call integration), not a network service; its consumers are those packages and their developers, not end users.
- The concrete serialized format and in-memory representation are implementation choices deferred to planning; this specification constrains their observable properties — determinism, versioning, round-trip fidelity, validation — not the format itself.
- Guaranteeing byte-identical serialization across platforms may require a fixed-point or quantized numeric representation. That representation is a durable, cross-package decision deferred to an ADR during planning (tracked as an open question in the parent epic).
- The initial command vocabulary and state fields follow the proposal's stated lists and may be extended by later features, governed by schema versioning.
- Simulation time is expressed in the canonical time unit defined here; wall-clock time and provider latency are out of scope for this feature and handled later by the harness.

## Non-Goals

- Aircraft dynamics, separation measurement, and runway state transitions (owned by the simulator).
- Scenario generation, difficulty dimensions, and viability labeling (owned by the scenario generator).
- Scoring, safety filtering, latency channels, and analysis (owned by the harness).
- Concrete baseline, oracle, or model controllers (owned by the controllers package).
- Any claim about operational aviation realism or the correctness of specific separation or performance values.

## Architecture Decisions

**Impact**: Project

- [ADR 0001 — Deterministic State Representation](../../adrs/0001-deterministic-state-representation.md) (Proposed): fixed-point integer base units and canonical deterministic serialization, the choice that makes cross-platform byte-identical traces possible (FR-008, SC-002). Resolves the open question tracked in the [parent epic](../../epics/0001-deterministic-simulator/epic.md). Requires acceptance before this feature moves to Active/implementation.
