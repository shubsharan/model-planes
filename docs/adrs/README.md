# Architecture Decisions

This file is the canonical ADR policy for model-planes. ADRs record durable project architecture, not the
implementation design of each feature.

## Impact Classification

Every feature plan classifies its architecture impact:

- `None`: no material design choice beyond localized implementation.
- `Feature`: reversible design, API, or persisted-contract choices owned by one pre-release feature.
  Record these choices in `research.md`, `data-model.md`, contracts, and the plan, not in a new ADR.
- `Project`: establishes or reverses a durable project boundary and either governs multiple features or
  packages, commits production data or external consumers, creates a costly operational, security, or
  deployment dependency, or departs from an Accepted ADR.

A public type, database field, package split, algorithm, or method signature is not automatically a
Project decision. Features with `None` or `Feature` impact may still link existing ADRs that govern them.

## ADR Content

One ADR records one durable choice with concise context, decision, consequences, and supersession links.
API inventories, complete schemas, task sequencing, feature acceptance criteria, and example-local terms
belong in feature artifacts or the current architecture and taxonomy documents.

## Lifecycle

- A Proposed ADR may evolve during planning and requires explicit user approval before acceptance.
- An Active feature with Project impact requires the same Accepted, non-Superseded ADR links in its spec
  and plan. A Pending feature may link Proposed or Accepted ADRs while planning.
- Accepted ADRs are immutable. Refinements that preserve the decision update current design documents;
  an actual reversal of established project architecture requires a superseding ADR.
- Done features retain the Accepted or Superseded ADRs that governed their implementation. Historical
  links are not rewritten to newer decisions.

<!-- speckit:generated:adr-index START -->

- [Deterministic State Representation](0001-deterministic-state-representation.md) — Accepted

<!-- speckit:generated:adr-index END -->
