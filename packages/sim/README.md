# @model-planes/sim

The **authoritative plant**. The single source of truth for world state.
Controllers depend on `sim` but must never reach past its command interface to
manipulate aircraft directly.

## Owns today

The **deterministic world engine**: one pure function advances the world by
exactly one tick, given a state and this tick's proposed motion commands.

- The declared, versioned **rules of motion** — turn, climb/descent, and speed
  convergence, bounded by each aircraft's own performance limits.
- **Command admission**: which motion commands are legal, and why an illegal one
  was refused. Nothing is clamped — an out-of-limits parameter refuses the whole
  command, so an accepted command is applied exactly as proposed.
- **Convergence targets** and their pending queue, held outside the snapshot and
  reconstructable by folding the applied-command log.
- Per-tick **events**: airspace exit, fuel/window exhaustion, target reached.

Every tick is a pure function of `(state, commands, RULESET_VERSION)` — no clock,
no randomness, no I/O — and its result snapshot is re-validated against the core
contract before it is returned.

## Will own later

Scope this package still carries, not yet built:

- Runway **state machines** (approach, final, landing, occupancy, go-around,
  exit) and the six non-motion command kinds (`hold`, `assignRunway`,
  `clearApproach`, `clearLand`, `goAround`, `divert`) — FEAT-0003.
- **Separation measurement** (horizontal/vertical, class-dependent rules) —
  FEAT-0004.
- Seeded **scenario generation** — FEAT-0005.
- The **replay trace file and its verifier**, which re-derives a trace from its
  recorded inputs — FEAT-0006. The tick engine already produces outcomes
  sufficient for it.

## Modules

`src/` is one module per concern; only `index.ts` is public.

| Module                  | Owns                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `index.ts`              | The public barrel — exactly the surface in the API contract. Re-exports nothing from `core`.                   |
| `ruleset.ts`            | `RULESET_VERSION` and every numeric constant and rule function the dynamics depend on, including quantization. |
| `trig.ts`               | Deterministic `sinMillideg` / `cosMillideg` over integer millidegrees. Internal.                               |
| `legality.ts`           | The `MotionCommand` control surface and the fixed-order admission checks.                                      |
| `assignments.ts`        | Folding admitted commands into per-aircraft targets: queueing, supersession, activation, target clearing.      |
| `world-engine-state.ts` | The immutable working state and its constructor.                                                               |
| `world-engine.ts`       | `advanceTick` — the fixed update order, event ordering, and contract re-validation.                            |
| `result.ts`             | Local `ok` / `err` constructors structurally identical to core's `Result`. Internal.                           |

## Public surface

- `RULESET_VERSION` — the rules in force.
- `MotionCommand`, `REJECTION_REASONS`, `RejectionReason`, `CommandRejection`,
  `CommandSupersession` — the control surface and its refusal vocabulary.
- `createWorldEngineState`, `WorldEngineState`, `AircraftAssignments` — the state.
- `advanceTick`, `TickOutcome`, `WorldEngineEvent`, `TargetDimension` — the tick.

Full signatures and normative guarantees live in
[the world engine API contract](../../docs/features/0002-aircraft-world-engine/contracts/world-engine-api.md).

## Ruleset version policy

`RULESET_VERSION` identifies the motion **and** legality rules in force. It is
incremented by any change to:

- a motion rule,
- a legality rule,
- the quantization step,
- the fixed update order, or
- a declared default.

Every `TickOutcome` carries it, so a preserved run is self-describing even after
the rules later change.

## Determinism

The shape of the code follows from Constitution I:

- **Integer state throughout.** Positions, headings, speeds, and altitudes are
  whole base units; floating point exists only transiently inside a rule.
- **No `Math.sin` / `Math.cos` in the state path.** IEEE-754 mandates correct
  rounding only for the basic operations, so a library transcendental may differ
  in its last bits across engines. `trig.ts` uses exact integer range reduction
  plus fixed polynomials instead, so results are bit-identical anywhere doubles
  are.
- **Round-half-to-even at every state boundary.** One declared, unbiased,
  platform-independent quantization ([ADR 0001](../../docs/adrs/0001-deterministic-state-representation.md)).
- **Declared orderings.** The per-tick update order is fixed, and events are
  emitted in a total order (aircraft id, then kind, then dimension) rather than
  discovery order.

The control surface is deliberately only the three motion command kinds. The
other six are **unrepresentable** at this interface — enforced by the type
checker, not rejected at runtime — so no run produced by this API can record a
clearance as applied during a tick in which clearances carry no meaning, and
correct controller behaviour is never counted as an illegal command.

## Constitution

- **I — Deterministic, Replayable Simulation.**
- **II — Authoritative Simulator, Advisory Controllers:** legality and physics live here,
  not in any controller.

## Depends on

`@model-planes/core`.

## Dev phase

Phase 1 (deterministic simulator).
