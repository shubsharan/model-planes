# @model-planes/scenarios

The scenario generator and its declared difficulty dimensions. Kept separate from
the plant because scenarios are a published scientific artifact with matched seeds
across controller conditions.

> Scaffold only — `src/` holds a placeholder entrypoint, no implementation yet.

## Owns

- Scenario **generation** from seeds.
- Declared **difficulty dimensions**: runway load, interaction load, uncertainty,
  latency, maneuver authority, commitment pressure.
- **Seed management** so conditions can be matched across controllers.
- **Labeling** of deliberately overloaded / adversarial cases.
- **Viability checks** for small and medium instances (delegated to the oracle in
  `@model-planes/controllers`).

## Constitution

- **V — Reproducible Scientific Protocol:** matched seeds, held-out vs tuning scenarios.
- Difficulty is characterized by declared dimensions, never raw aircraft count alone.

## Depends on

`@model-planes/core`, `@model-planes/sim`.

## Dev phase

Phases 1–3.
