# @model-planes/core

Shared contracts for the whole benchmark. Everything depends on `core`; `core`
depends on nothing. It is the dependency **sink**.

> Scaffold only — `src/` holds a placeholder entrypoint, no implementation yet.

## Owns

- Aircraft and runway **state** types.
- The structured supervisory **command vocabulary** (assign heading/altitude/speed,
  hold, assign/change runway, clear for approach, clear to land, go-around, divert).
- The **versioned, immutable trace/record schema** — the observed state, the raw
  proposed command, any legality/safety intervention, the applied command, resulting
  state, safety margins, and provider/model/budget/latency metadata.
- Units, seed types, and shared version tags.

## Constitution

- **I — Deterministic, Replayable Simulation:** the record schema is what makes a run
  replayable.
- **II — Authoritative Simulator, Advisory Controllers:** the command vocabulary is the
  only channel controllers may use.
- **IV — Model-vs-System Attribution:** raw → intervention → applied is expressed in the
  record schema here, not by splitting packages.

## Dependency graph

`core` ← sim ← scenarios, controllers ← harness ← cli

## Dev phase

Phase 1 (deterministic simulator).
