# Roadmap

Directional sequencing and epic status for model-planes. See
[the documentation map](README.md) for the ownership of this roadmap.

This document owns the order in which capability is built and the decision gates
between stages. It does not own APIs, schemas, or feature design (those live in
[features](features/)), the package layout ([architecture](architecture.md)), or
the durable rules that constrain every phase ([constitution](../.specify/memory/constitution.md)).
Phase detail and its motivating research live in the [proposal](proposal.md).

## North star

> As a dynamic system approaches capacity, can AI controllers preserve safety by
> anticipating future constraints and deliberately sacrificing efficiency, or do
> they continue pursuing throughput until control breaks down?

The platform reaches that question by building the authoritative plant first,
layering the time regimes and difficulty dimensions onto it, and only then running
comparative studies. Every phase is gated on evidence, not on effort spent.

## Sequencing principles

- **Plant before policy.** A deterministic, replayable simulator is the sink every
  later stage depends on; nothing scientific is measurable until it is trustworthy
  ([Constitution I, II](../.specify/memory/constitution.md)).
- **Regimes in order of controllability.** Frozen ticks establish the planning
  ceiling; budgeted ticks isolate bounded deliberation; deterministic asynchronous
  time is the principal causal condition; wall-clock is a system-level extension run
  last.
- **Difficulty is factored, not scalar.** Runway load and interaction load are
  manipulated independently before uncertainty and delay are added.
- **A gate is a verified exit criterion.** A phase closes only when its criterion is
  demonstrated on a trace or a reproduced result — never on the belief that the work
  is done.

## Phase sequence

The phases mirror the proposal's [development plan](proposal.md#development-plan);
each maps onto the packages that carry it and the constitution principles it must
satisfy.

| Phase | Builds | Primary packages | Decision gate (exit criterion) |
| --- | --- | --- | --- |
| **1. Deterministic simulator** | Aircraft plant, runway state machines, command schema, separation checker, seeded scenario generator, replay trace | [`core`](../packages/core/README.md), [`sim`](../packages/sim/README.md), [`scenarios`](../packages/scenarios/README.md) | Identical commands and seed always produce an identical verified trace. |
| **2. Tick-based benchmark** | Generous and budgeted frozen ticks, deterministic baselines, small-instance offline oracle, initial model adapters | [`controllers`](../packages/controllers/README.md) (`baselines/`, `oracle/`, `agents/`), [`harness`](../packages/harness/README.md) (`regimes/`, `scoring/`) | Baseline policies produce stable, explainable results across low, near-capacity, and overload scenarios. |
| **3. Capacity study** | Factorial runway-load × interaction-load suite, model teams, matched solo controls, held-out scenarios, statistical reporting | [`harness`](../packages/harness/README.md) (`scoring/`, `analysis/`), [`scenarios`](../packages/scenarios/README.md) | The platform can estimate a controller's safe capacity boundary with uncertainty. |
| **4. Robustness & deferred control** | Trajectory error, response jitter, wind, future commitments, freeze horizons, burst-recovery scenarios | [`scenarios`](../packages/scenarios/README.md), [`harness`](../packages/harness/README.md) (`latency/`, `safety/`) | Uncertainty and commitment costs are independently configurable and exactly replayable. |
| **5. Deterministic real time** | Virtual asynchronous clock, separate delay channels, mandatory executable safe-action package with optional deliberation | [`harness`](../packages/harness/README.md) (`latency/`, `regimes/`), [`controllers`](../packages/controllers/README.md) (`agents/`) | Identical controller outputs and latency seeds recreate the same real-time run. |
| **6. Wall-clock experiments** | Selected frontier systems under natural provider latency, with preserved request timing, retries, failures, and service metadata | [`harness`](../packages/harness/README.md) (`trace-io/`), [`cli`](../packages/cli/README.md) | Results clearly distinguish deterministic benchmark performance from end-to-end deployed-system performance. |

## Gate discipline

- **1 → 2** is the hard foundation gate. Physical and legal invariants are validated
  with scripted controllers before any model is introduced; without exact replay, no
  later comparison is interpretable.
- **2 → 3** requires baselines whose behavior is *explainable*, not merely stable —
  they are the reference frame every model condition is read against.
- **3 → 4** holds difficulty factored: the capacity surface over runway load and
  interaction complexity must exist before uncertainty and delay perturb it.
- **4 → 5** promotes deterministic asynchronous time as the principal causal
  experiment; the safe-action-package requirement is what makes real-time results
  about control rather than about latency alone.
- **5 → 6** is deliberately last. Natural wall-clock operation measures the whole
  model–service–tool stack and must never stand in for model capability
  ([Constitution IV, and time-regime constraints](../.specify/memory/constitution.md)).

Safety reporting is noncompensatory at every gate: throughput never buys back a
collision, incursion, or severe separation loss ([Constitution III](../.specify/memory/constitution.md)).

## Epics

The epic index below is generated by `.specify/scripts/bash/sync-docs.sh`
(`pnpm speckit:sync`) from the specs under [features](features/) and their epics.
Do not edit inside the generated markers.

<!-- speckit:generated:roadmap-epics START -->

- [Deterministic Simulator](epics/0001-deterministic-simulator/epic.md) — Active

<!-- speckit:generated:roadmap-epics END -->
