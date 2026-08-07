# @model-planes/harness

The environment + evaluation engine. It runs a scenario against a controller under a
chosen time regime, applies safety interventions, records an immutable trace, and
scores the outcome. This is the root of the dependency graph.

> Scaffold only — `src/` holds a placeholder entrypoint, no implementation yet.

## Internal modules (planned)

- `regimes/` — the four time regimes: generous frozen ticks, budgeted frozen ticks,
  deterministic asynchronous time, natural wall-clock.
- `latency/` — separate, independently configurable, timestamped delay channels
  (observation, teammate message, inference, command transmission, aircraft response).
- `safety/` — legality enforcement + safety-fallback filters, applied by the environment,
  preserving the raw proposed command alongside the applied one.
- `scoring/` — the lexicographic outcome vector: safety, capacity/efficiency, timeliness,
  and tail metrics (worst-episode harm, quantiles, CVaR of the maximum violation).
- `analysis/` — cross-run statistical reporting and capacity-surface / tail-risk aggregation.
- `trace-io/` — immutable trace emission and loading (schema owned by `core`).

## Seams to promote later

- `safety/` → `@model-planes/safety` once filters need independent versioning.
- `scoring/` (+ `analysis/`) → `@model-planes/scoring` — the **likely first split**, since
  the outcome vector is a published artifact under Principle III.

## Constitution

- **I — Deterministic replay** (async clock + latency seeds).
- **III — Noncompensatory Safety:** safety outcomes reported before and independently of
  efficiency.
- **V — Reproducible Scientific Protocol:** wall-clock is never the primary causal condition.

## Depends on

`@model-planes/core`, `@model-planes/sim`, `@model-planes/scenarios`,
`@model-planes/controllers`.

## Dev phase

Phases 1–5.
