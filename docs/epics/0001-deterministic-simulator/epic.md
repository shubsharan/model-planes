---
status: Active
---

# Epic: Deterministic Simulator

## Context

The repository is scaffold only: every package `src/` holds a placeholder, so there
is no plant, no command vocabulary, and no trace. Nothing scientific is measurable
until an authoritative simulator exists and is *provably* deterministic and
replayable — every later phase (tick-based benchmark, capacity study, robustness,
real time) reads its results against traces this layer produces. This epic is the
foundation gate of the [roadmap](../../roadmap.md): a controller comparison, a
capacity boundary, or a causal claim is only interpretable if identical inputs
reproduce identical outputs exactly.

## Outcome

A deterministic, versioned ATC simulator that, given a scenario seed and a stream of
structured controller commands, advances an authoritative aircraft-and-runway world
under explicit rules, measures separation, and emits an immutable trace that replays
to a byte-identical result.

## Epic Scenarios

1. **Run a scenario end to end** — A benchmark author generates a scenario from a
   seed, drives it with a scripted controller through the command vocabulary, and the
   simulator advances aircraft, transitions runway state, measures separation, and
   writes a complete trace across low, near-capacity, and overload traffic.
2. **Reproduce a recorded run** — The author replays a recorded trace through the
   verifier and obtains a byte-identical trace; the same command stream on a different
   seed yields a different but equally reproducible run.
3. **Catch an invariant breach** — A scripted controller that issues an illegal or
   out-of-limits command is rejected or measured by the simulator, never silently
   applied, so physical and legal invariants hold regardless of controller behavior.

## Done When

- **EDC-001**: Identical scenario seed plus identical command stream always produce a
  byte-identical, verified trace, and the replay verifier reproduces any recorded
  trace exactly.
- **EDC-002**: All declared physical and legal invariants — dynamics bounds, legal
  runway transitions, and separation measurement — are validated by scripted
  controllers across low, near-capacity, and overload scenarios, with no run violating
  them.
- **EDC-003**: Every run preserves an immutable, versioned trace that distinguishes
  the state a controller observed from the state in which its command was applied and
  is sufficient for exact replay.

## Boundaries

- **In scope**: deterministic aircraft dynamics and the tick engine; runway state
  machines; the structured command vocabulary and versioned command/trace schema;
  authoritative separation measurement; seeded, reproducible scenario generation with
  declared difficulty dimensions and labeling; the replay trace and its verifier;
  scripted controllers used only to exercise and validate the plant.
- **Out of scope**: model and baseline controllers, the offline oracle, scoring and
  analysis, safety filters and legality-enforcement conditions, time regimes beyond
  generous frozen ticks, separate latency channels, and active uncertainty processes
  (wind, response jitter) beyond declared seeded hooks — each deferred to a later
  roadmap epic.
- **Invariant**: the simulator is authoritative and deterministic — every state
  transition follows explicit, versioned rules; any stochastic process is seeded and
  declared; controllers propose only through the command vocabulary and never mutate
  world state ([Constitution I, II](../../../.specify/memory/constitution.md)).

## Planned Features

1. **Core contracts**
   - **Outcome**: a shared, versioned contract layer — state, units, seeds, the
     command vocabulary, and the immutable trace/record schema — that every other
     package imports and builds against.
   - **Depends on**: None
   - **Advances**: EDC-001, EDC-003
2. **Aircraft plant and tick engine**
   - **Outcome**: given state and commands, aircraft motion advances deterministically
     under explicit versioned rules within per-aircraft performance limits.
   - **Depends on**: Core contracts
   - **Advances**: EDC-001, EDC-002
3. **Runway state machines**
   - **Outcome**: each runway transitions through its legal modes — approach, final,
     landing, occupancy, go-around, exit — under explicit rules, and illegal
     transitions are rejected.
   - **Depends on**: Aircraft plant and tick engine
   - **Advances**: EDC-002
4. **Separation checker**
   - **Outcome**: the simulator authoritatively measures pairwise horizontal and
     vertical separation and flags violations by aircraft-class rules, as measurement
     rather than avoidance.
   - **Depends on**: Aircraft plant and tick engine
   - **Advances**: EDC-002
5. **Seeded scenario generator**
   - **Outcome**: scenarios are generated deterministically from a seed with declared
     difficulty dimensions and labels, reproducible across runs.
   - **Depends on**: Core contracts
   - **Advances**: EDC-001
6. **Replay trace and verifier**
   - **Outcome**: every run emits an immutable, versioned trace sufficient for exact
     replay, and a verifier confirms a replayed run reproduces the original trace
     identically.
   - **Depends on**: Core contracts; Aircraft plant and tick engine; Runway state
     machines; Separation checker; Seeded scenario generator
   - **Advances**: EDC-001, EDC-003

## Risks and Open Questions

- **[OPEN]** Can byte-identical traces be guaranteed across platforms given
  floating-point non-determinism, or is a fixed-point / quantized state
  representation required? — Resolve in an ADR before Core contracts stabilizes.
- **[OPEN]** How much stochastic machinery (wind, response jitter) is scaffolded now
  versus deferred, given the seeded-process hooks must be declared even while unused —
  Resolve in Seeded scenario generator.
- **[RISK]** Over-detailed dynamics could consume the epic without improving
  determinism — keep dynamics simplified but explicit. Address in Aircraft plant and
  tick engine.
- **[RISK]** An unstable trace/record schema forces rework in every dependent package
  — version it early. Address in Core contracts.

## Features

<!-- speckit:generated:epic-features START -->

- [Core Contracts](../../features/0001-core-contracts/spec.md) — Active

<!-- speckit:generated:epic-features END -->
