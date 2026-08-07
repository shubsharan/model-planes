# @model-planes/cli

User-facing entrypoints that orchestrate the benchmark. Thin — all behavior lives in
the packages it drives.

> Scaffold only — no implementation yet. `src/` is empty.

## Planned commands

- generate scenarios (from seeds + declared difficulty dimensions);
- run a benchmark (scenario × controller × regime);
- replay and verify a trace;
- produce reports (capacity surfaces, tail risk).

## Depends on

`@model-planes/harness` (and, transitively, the rest of the graph).

## Dev phase

Phase 2 onward.
