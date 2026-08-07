# Phase 1 Data Model: Core Contracts

Entities the `core` package defines. Fields use the canonical fixed-point base units
from [ADR 0001](../../adrs/0001-deterministic-state-representation.md). These are shared
*shapes and invariants* only — no dynamics, scoring, or generation logic (FR-012).

## Canonical units (base units)

| Quantity | Base unit | Notes |
| --- | --- | --- |
| Distance / position | millimetre (mm) | integer; airspace radius ~10⁸ mm |
| Altitude | millimetre (mm) | integer, ≥ 0 |
| Heading / angle | millidegree (m°) | integer in `[0, 360000)`, wraps |
| Speed | mm per second (mm/s) | integer, ≥ 0 |
| Time | tick | integer; `msPerTick` declared once per schema |
| Fuel / time window | base unit (declared) | integer, ≥ 0 |

Conversions from an alternate boundary unit are exact; a quantity with a missing or
ambiguous unit is rejected (FR-009, SC-006).

## Enumerations

- **AircraftClass**: the wake/separation classes used for class-dependent separation
  (e.g. `light`, `medium`, `heavy`). Exact members are a versioned list.
- **CommandKind**: `assignHeading` | `assignAltitude` | `assignSpeed` | `hold` |
  `assignRunway` | `clearApproach` | `clearLand` | `goAround` | `divert` (FR-002).

## Entities

### Vec3 / Position

- `x`, `y`, `z`: distance (mm), integer. `z` is altitude (≥ 0).
- Validation: each component within airspace bounds; integers only.

### AircraftPerformanceLimits

- `minSpeed`, `maxSpeed`: speed (mm/s).
- `maxClimbRate`, `maxDescentRate`: speed (mm/s), ≥ 0.
- `maxTurnRate`: millidegree per tick, ≥ 0.
- Validation: `minSpeed ≤ maxSpeed`; all ≥ 0.

### AircraftState

- `id`: stable aircraft identifier.
- `position`: Vec3 (mm).
- `heading`: millidegree in `[0, 360000)`.
- `speed`: mm/s.
- `class`: AircraftClass.
- `limits`: AircraftPerformanceLimits.
- `separationRequirement`: distance (mm) minimum, and vertical (mm) minimum.
- `fuelOrWindowRemaining`: integer base unit, ≥ 0.
- Validation: heading in range; speed within `limits`; integers only (FR-001, FR-011).

### RunwayState

- `id`: stable runway identifier.
- `threshold1`, `threshold2`: Position (mm) — the two runway end thresholds. Length and
  orientation are *derived* from these, not stored.
- `width`: distance (mm), > 0.
- `closed`: boolean — the runway is out of service. This is an exogenous
  scenario/environment fact: not agent-set, and not derivable from aircraft positions,
  so it is the one irreducible piece of runway state that must be carried here.
- Validation: `threshold1 ≠ threshold2`; both endpoints within airspace bounds;
  `width > 0`; integers only. Occupancy is *not* stored — `sim` derives it (and
  multi-landing legality under separation + time gap) from aircraft positions relative
  to this geometry.

### WorldSnapshot (observed state)

- `simTime`: tick.
- `schemaVersion`: integer (FR-007).
- `aircraft`: list of AircraftState (unique ids).
- `runways`: list of RunwayState (unique ids).
- Validation: unique ids; `simTime` ≥ 0. This is the exact state handed to a controller
  at a decision point (FR-001).

### Command

- `kind`: CommandKind.
- `target`: aircraft `id`.
- `params`: kind-specific, in base units — e.g. `assignHeading { heading }`,
  `assignAltitude { altitude }`, `assignSpeed { speed }`, `assignRunway { runwayId }`,
  `hold`/`clearApproach`/`clearLand`/`goAround`/`divert` (no or minimal params).
- `observedAt`: tick — the snapshot time this decision was based on (FR-003).
- `effectiveAt`: tick — when it applies (FR-003).
- Validation: `params` match `kind`; values within their unit ranges; the vocabulary is
  the only channel of intent — no field can set coordinates directly (FR-004).
- Note: `effectiveAt < observedAt` is *representable and detectable*; whether it is
  legal is the simulator's decision, not this contract's (see Edge Cases in the spec).

### Intervention

- `reason`: enumerated legality/safety reason.
- `detail`: optional structured note.
- Distinct from the proposed and applied commands (FR-006).

### DecisionRecord

- `observed`: WorldSnapshot given to the controller.
- `messages`: controller messages / tool use (opaque, ordered).
- `proposed`: raw Command as the controller emitted it (FR-005, FR-006).
- `intervention`: Intervention or none.
- `applied`: Command actually applied (may equal `proposed`).
- `result`: resulting AircraftState/RunwayState deltas or snapshot.
- `margins`: safety margins and scoring events at this decision.
- `meta`: provider, model, prompt, budget, latency metadata.
- Validation: `proposed`, `intervention`, `applied` independently retrievable;
  required fields present (FR-005, FR-011, SC-003).

### Trace

- `schemaVersion`: integer (FR-007, SC-004).
- `seed`: Seed used for the run.
- `records`: ordered list of DecisionRecord — sufficient for exact replay (EDC-001,
  EDC-003).
- Validation: version present; records ordered by `simTime`/index.

### Seed

- `root`: the scenario seed value.
- Operation `deriveSubSeed(label | index)`: deterministic, pure — identical inputs give
  identical sub-seeds on every run and process (FR-010, SC-005).

## Serialization contract (applies to all entities)

- Deterministic: identical logical values → byte-identical output; round-trips to an
  identical value (FR-008, SC-002).
- Integers only in the wire form; fixed field order / sorted keys; explicit
  `schemaVersion`; reject on version mismatch when reading (FR-007, SC-004).
- See [contracts/trace-schema.md](contracts/trace-schema.md) for the wire shape and
  [contracts/public-api.md](contracts/public-api.md) for the exported surface.

## State transitions (reference only)

Neither aircraft lifecycle nor runway occupancy is a stored field; both are derived,
and the legal rules that govern them are owned by `sim` (the runway state machines
feature), not by this contract. `core` defines the vocabulary and geometry; `sim`
enforces the transitions.

Runway occupancy — whether a landing is currently legal — is *derived* by `sim` from
aircraft positions relative to the runway geometry defined above, together with the
separation and time-gap rules `sim` owns; multiple aircraft may use one runway in
sequence provided those rules hold. The only runway fact carried here is `closed`,
which no position or command can reconstruct.

Aircraft lifecycle is deliberately **not** a stored field. An aircraft's kinematic
phase (approaching, on final, landing, cleared the runway, exited) is *derived* from
its `position` relative to runway geometry, and its clearance/authorization state is
*derived* from the command log in the `Trace` — e.g. an aircraft is cleared to land
iff it received a `clearLand` with no superseding `goAround`/`divert`/reassignment
since. Neither is duplicated as an authored field on `AircraftState`, so observed
state carries no value that can diverge from position or from the recorded commands.
Whether `sim` denormalizes a clearance hint into a snapshot for controller ergonomics
is a `sim`/harness decision governed by schema versioning, not part of this contract.
