# Architecture — Package Layout

Canonical map of the workspace. Per-package responsibility lives in each package's
`README.md`; this file owns only the high-level layout and the dependency graph. It
does not own durable architecture *decisions* — those are [ADRs](adrs/README.md).

The repository is a `pnpm` + `turbo` workspace: `packages/*`, wired by `pnpm-workspace.yaml`, `turbo.json`, and TypeScript project references
(`tsconfig.base.json` + the root solution `tsconfig.json`).

## Packages


| Package                                            | Responsibility                                                                                              | Depends on                        | Constitution |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------ |
| `[core](../packages/core/README.md)`               | Shared contracts: state, command vocabulary, versioned trace/record schema, units, seeds                    | —                                 | I, II, IV    |
| `[sim](../packages/sim/README.md)`                 | Authoritative plant: dynamics, runway state machines, separation, tick engine, replay verifier              | core                              | I, II        |
| `[scenarios](../packages/scenarios/README.md)`     | Scenario generator, difficulty dimensions, seeds, viability, labeling                                       | core, sim                         | V            |
| `[controllers](../packages/controllers/README.md)` | Command proposers — modules: `baselines/`, `oracle/`, `agents/`                                             | core, sim                         | IV, VI       |
| `[harness](../packages/harness/README.md)`         | Environment + evaluation — modules: `regimes/`, `latency/`, `safety/`, `scoring/`, `analysis/`, `trace-io/` | core, sim, scenarios, controllers | I, III, V    |
| `[cli](../packages/cli/README.md)`                 | User-facing entrypoints                                                                                     | harness                           | —            |




## Dependency graph

```
core ─► sim ─► scenarios ─┐
          └──► controllers ┴─► harness ─► cli
```

Acyclic; `core` is the sink, `cli` the root. Deepest chain: `controllers → sim → core`.

## Seams to promote later

Several boundaries start as **modules** and become their own package only when they
earn it (a move + a manifest, not a refactor):

- `harness/scoring/` (+ `analysis/`) → `@model-planes/scoring` — likely first split.
- `harness/safety/` → `@model-planes/safety`.
- `controllers/agents/` → `@model-planes/agents`.



## Status

Scaffold only. Every package `src/` holds only a placeholder entrypoint; implementation arrives through the
spec-kit feature flow, starting with Phase 1 (`core` contracts, then the `sim` plant).