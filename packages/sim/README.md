# @model-planes/sim

The **authoritative plant**. The single source of truth for world state.
Controllers depend on `sim` but must never reach past its command interface to
manipulate aircraft directly.

> Scaffold only — `src/` holds a placeholder entrypoint, no implementation yet.

## Owns

- Aircraft **dynamics** (speed, climb/descent, turn limits).
- Runway **state machines** (approach, final, landing, occupancy, go-around, exit).
- **Separation measurement** (horizontal/vertical, class-dependent rules).
- The **deterministic tick engine**: identical seed + identical commands ⇒ identical trace.
- The **replay verifier** that re-derives a trace from its recorded inputs.

## Constitution

- **I — Deterministic, Replayable Simulation.**
- **II — Authoritative Simulator, Advisory Controllers:** legality and physics live here,
  not in any controller.

## Depends on

`@model-planes/core`.

## Dev phase

Phase 1 (deterministic simulator).
