# Phase 1 Data Model: Aircraft World Engine

Entities the `sim` world engine defines *on top of* the FEAT-0001 core contracts. Everything
below reuses the core types verbatim — `WorldSnapshot`, `AircraftState`, `RunwayState`,
`Command`, branded units (`Mm`, `Millideg`, `MmPerSec`, `MillidegPerTick`, `Tick`) —
and never redefines or extends their wire shapes. All quantities are integer base units
(ADR 0001).

## Reused core entities (unchanged)

| Entity                                       | Role here                                              |
| -------------------------------------------- | ------------------------------------------------------ |
| `WorldSnapshot`                              | Input and output world state of every tick             |
| `AircraftState` / `AircraftPerformanceLimits`| Kinematic state and per-aircraft bounds enforced       |
| `RunwayState`                                | Static geometry only in this feature (no transitions)  |
| `Command` / `CommandKind`                    | Sole channel of controller intent                      |
| `Tick`, `MS_PER_TICK`                        | Time base; one advance = one tick = 100 ms             |

## New entities (owned by `sim`)

### MotionCommand

The subset of the core `Command` union this world engine accepts — the three kinds that move
an aircraft:

- `assignHeading`, `assignAltitude`, `assignSpeed`, each with its core-defined `params`,
  `target`, `observedAt`, and `effectiveAt` fields unchanged.
- Defined by narrowing core's `Command` (`Extract<Command, { kind: ... }>`), so it stays
  structurally identical to the contract and any real `Command` of those kinds is
  assignable without conversion.
- The remaining six kinds are deliberately outside this type: they are authorizations
  and declarations rather than kinematic inputs, and admitting them would let a run
  record a clearance as *applied* during ticks in which clearances have no meaning
  (research R7). FEAT-0003 widens this union when it has semantics to attach.

### RulesetVersion

- `RULESET_VERSION`: exported integer constant, starts at `1`.
- Any change to a motion rule, legality rule, quantization step, update order, or
  declared default (research R1–R8) increments it.
- Recorded by callers into trace `meta`; the world engine also exposes it on every
  `TickOutcome` so a persisted outcome is self-describing.

### AircraftAssignments

Active targets an aircraft is converging toward, plus commands admitted but not yet
effective. Derived state: reconstructable by folding the applied-command log from the
initial snapshot (research R5). Not part of `WorldSnapshot`.

- `targetHeading?`: `Millideg` — absent until an `assignHeading` takes effect.
- `targetAltitude?`: `Mm` — absent until an `assignAltitude` takes effect.
- `targetSpeed?`: `MmPerSec` — absent until an `assignSpeed` takes effect.
- `pending`: ordered list of admitted `MotionCommand`s with `effectiveAt` in the future.
- Invariants: every target within the aircraft's `limits` / airspace ranges (enforced
  at admission, so an assignment never stores an illegal target); `pending` sorted by
  (`effectiveAt`, admission order).

### WorldEngineState

The world engine's complete working state. Immutable; every tick returns a fresh value.

- `snapshot`: `WorldSnapshot` — the authoritative world.
- `assignments`: map aircraft `id` → `AircraftAssignments` (ids ⊆ snapshot aircraft ids).
- `exited`: set of aircraft ids frozen at the airspace boundary (research R8).
- `exhausted`: set of aircraft ids whose fuel-or-time window reached 0.
- Constructor `createWorldEngineState(snapshot)` validates via `parseWorldSnapshot` and
  starts with empty assignments/flags.
- Invariants: `snapshot` always passes `parseWorldSnapshot`; `exited`/`exhausted` ⊆
  snapshot aircraft ids; an id in `exited` has motion frozen from that tick on.

### CommandRejection

- `command`: the `MotionCommand` exactly as proposed (never edited).
- `reason`: versioned enum —
  `unknownTarget` | `staleEffectiveAt` | `speedOutOfLimits` | `altitudeOutOfRange` |
  `headingOutOfRange`. Every member is a controller error; there is no
  "unsupported kind" member, because unsupported kinds are unrepresentable at this
  interface rather than rejected (research R7).
- `detail`: human-readable string (non-normative).
- Invariant: a rejected command has zero effect on `WorldEngineState`.

### CommandSupersession

- `superseded`: the earlier admitted `MotionCommand`.
- `by`: the later `MotionCommand` of the same kind, same target, same effective tick.
- Explicit outcome, not a rejection (research R6): both commands remain visible.

### WorldEngineEvent

Per-aircraft, per-tick occurrences. Versioned discriminated union:

- `airspaceExited { aircraftId, tick }` — motion clamped to the boundary; aircraft
  frozen thereafter.
- `fuelExhausted { aircraftId, tick }` — window hit 0 this tick; flag permanent.
- `targetReached { aircraftId, tick, dimension: heading | altitude | speed }` — the
  assigned target was exactly attained this tick.

### TickOutcome

The complete result of `advanceTick(state, commands)`:

- `rulesetVersion`: integer — `RULESET_VERSION` in force.
- `state`: next `WorldEngineState` (with `snapshot.simTime` advanced by exactly 1).
- `applied`: `MotionCommand[]` — commands that took effect this tick, in application
  order. Every entry changed a target; there is no accepted-but-inert case (research R7).
- `rejected`: `CommandRejection[]` — in submission order.
- `superseded`: `CommandSupersession[]`.
- `events`: `WorldEngineEvent[]` — deterministic order: by aircraft id, then event kind.
- Invariant: `applied` ∪ `rejected` ∪ `superseded` accounts for every submitted and
  every newly-effective pending command — nothing is silently dropped (FR-007/FR-008).
  The fields map 1:1 onto what a caller needs to assemble core `DecisionRecord`s.

## State transitions

Per `advanceTick`, in declared fixed order (research R2, R6):

1. **Admission**: validate each submitted command (legality per R6) → reject or admit;
   admitted same-kind/same-target/same-tick duplicates resolve last-wins with an
   explicit supersession.
2. **Activation**: pending commands whose `effectiveAt` equals the new tick become
   active targets.
3. **Steering**: per aircraft (snapshot order): heading steps ≤ `maxTurnRate` toward
   target (shortest direction, tie clockwise, exact snap — R3); speed steps to target
   (R4); altitude steps ≤ climb/descent rate toward target, floored at 0.
4. **Motion**: horizontal position advances by the new heading/speed via deterministic
   trig (R1), each component quantized round-half-to-even to integer mm (R2); frozen
   (`exited`) aircraft do not move.
5. **Resources & bounds**: fuel window decrements by 1 (floor 0, `fuelExhausted` event
   at the transition); a move that would cross the airspace bound clamps to the
   boundary and raises `airspaceExited` (R8).
6. **Assembly**: new snapshot (simTime + 1) is re-validated against the core contract;
   outcome lists assembled in their deterministic orders.

Aircraft lifecycle (approach, landing, runway occupancy) remains **derived, out of
scope** here — owned by the runway state machines feature, per the FEAT-0001
data-model's "State transitions" note.

## Validation rules

- Every produced `snapshot` passes `parseWorldSnapshot` (integers, ranges, unique ids).
- Per-tick deltas never exceed `maxTurnRate` / climb/descent per-tick equivalents;
  speed always within `[minSpeed, maxSpeed]`.
- Admission enforces target legality against the *targeted aircraft's* limits and the
  airspace ranges, so stored assignments are always attainable.
- `advanceTick` never mutates its arguments (frozen inputs in tests).
