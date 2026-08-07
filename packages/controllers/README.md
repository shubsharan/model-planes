# @model-planes/controllers

Everything that **proposes commands**. Controllers read observed state and emit
supervisory commands through the `core` vocabulary; they never mutate the plant.

> Scaffold only — `src/` holds a placeholder entrypoint, no implementation yet.

## Internal modules (planned)

- `baselines/` — deterministic reference policies: first-come-first-served,
  earliest-estimated-arrival, round-robin, join-shortest-queue,
  join-lowest-expected-workload, class-based runway splitting, greedy
  earliest-conflict-first, reactive minimum-separation, rolling-horizon.
- `oracle/` — offline full-information optimizer for bounded instances and the
  approximate viability oracle (regret reference).
- `agents/` — model/provider adapters, the versioned prompt + action schema, solo and
  free-form multi-agent teams, and inference-budget accounting.

## Seams to promote later

`agents/` → `@model-planes/agents` once provider SDK dependencies would otherwise
leak into the deterministic baselines.

## Constitution

- **IV — Model-vs-System Attribution** and **VI — Behavioral Constructs.**
- Multi-agent organization is **not prescribed**; team structure is an emergent outcome
  compared against a matched-budget solo controller.

## Depends on

`@model-planes/core`, `@model-planes/sim`.

## Dev phase

Phases 2–3.
