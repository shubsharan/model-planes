<!--
Sync Impact Report
- Version change: none -> 1.0.0 (initial ratification)
- Principles changed: initial adoption of six principles
  - I. Deterministic, Replayable Simulation
  - II. Authoritative Simulator, Advisory Controllers
  - III. Noncompensatory Safety
  - IV. Model-vs-System Attribution
  - V. Reproducible Scientific Protocol
  - VI. Behavioral Constructs, No Overclaiming
- Sections changed: added Simulation & Evidence Constraints; retained Spec-Driven
  Delivery Gates; authored Governance
- Templates and commands checked:
  - .specify/templates/plan-template.md (✅ compatible; Constitution Check reads gates dynamically)
  - .specify/templates/spec-template.md (✅ compatible; no constitution-specific edits required)
  - .specify/templates/tasks-template.md (✅ compatible; no constitution-specific edits required)
  - .specify/templates/commands/*.md (✅ no outdated agent-specific references requiring change)
- Follow-up TODOs: NONE
-->

# Air Traffic Control Benchmark Constitution

## Core Principles

### I. Deterministic, Replayable Simulation

The simulator is the single source of truth for world state and MUST be deterministic: identical
scenario seed plus identical controller commands MUST always produce an identical, verified trace.
Every state transition MUST follow explicit, versioned rules; any stochastic process (arrival-time
error, wind, response jitter) MUST be seeded and declared. Each command MUST carry a simulation
timestamp and an effective time, and the system MUST distinguish the state an agent observed from the
state in which its command was applied. Every run MUST preserve an immutable trace sufficient for
exact deterministic replay.

Rationale: Reproducibility is the foundation of a scientific benchmark. Without exact replay,
controller comparisons, causal attribution, and debugging are impossible, and results cannot be
independently verified.

### II. Authoritative Simulator, Advisory Controllers

Model agents MUST interact only through the structured supervisory command vocabulary (e.g., assign
heading, altitude, speed, hold, runway, clear for approach, clear to land, go-around, divert). Agents
MUST NOT directly manipulate aircraft coordinates or override plant dynamics. The simulator MUST
remain authoritative over aircraft motion, legal state transitions, separation measurement, and
runway state. Legality and safety interventions MUST be applied by the environment, not the agent.

Rationale: A clean plant/controller boundary keeps the physics and the rules trustworthy regardless
of agent behavior, and it is what makes measured controller performance meaningful rather than an
artifact of agents editing the world.

### III. Noncompensatory Safety

Safety outcomes MUST be reported before and independently of efficiency outcomes. Throughput,
delay, or any efficiency measure MUST NOT offset or erase a collision, runway incursion, or severe
separation loss in reported results. Results MUST be published as a lexicographic outcome vector and
as safety-throughput frontiers; a single scalar score MAY be provided only as a clearly secondary
convenience. Reporting MUST include full safety distributions and tail measures (worst-episode harm,
low outcome quantiles, conditional value at risk of the maximum violation), not means alone.

Rationale: Rare but catastrophic failures vanish inside averages and weighted scores. A benchmark
about control near capacity is only honest if unsafe behavior can never be bought back with
throughput.

### IV. Model-vs-System Attribution

The raw command proposed by each agent MUST be preserved separately from any legality or safety
intervention and from the command actually applied. Raw model control, legality-enforced control, and
full-safety-fallback control MUST be evaluated as separate conditions. Reports MUST distinguish model
capability from tool-assisted and safety-protected system performance, and MUST record intervention
frequency, edit magnitude, and the difference between proposed and executed outcomes.

Rationale: A safety system that repeatedly rescues a controller must not make the controller appear
safe. Attribution is what lets the benchmark measure the model rather than the scaffolding around it.

### V. Reproducible Scientific Protocol

The simulator, scenario generator, rules, and scoring functions MUST be published, and the plant,
prompts, action schema, and safety policies MUST be versioned. Controller conditions MUST use matched
scenario seeds and comparable inference budgets where a comparison requires it. Exploratory tuning
scenarios MUST be kept separate from held-out evaluation scenarios. Primary hypotheses and outcome
order MUST be preregistered before final runs. Every attempted run — including provider failures and
invalid outputs — MUST be reported, with confidence intervals and full distributions.

Rationale: Interpretable comparisons depend on controlling what varies. Versioning, matched seeds,
held-out data, preregistration, and complete run reporting prevent the tuning, cherry-picking, and
silent-failure biases that would otherwise make the capacity surface uninterpretable.

### VI. Behavioral Constructs, No Overclaiming

Constructs such as attention, deferred control, and overload MUST be defined through directly
observable model behavior (e.g., omitted, early, late, duplicated, or superseded commands;
intervention latency; distribution of computation across conflicts). Claims MUST NOT assert
human cognitive mechanisms, formal control guarantees, or operational aviation readiness that the
evidence does not support. Rare-event probability claims MUST NOT exceed what the number of trials
supports, and naturalistic versus conflict-enriched stress-test results MUST be reported separately.

Rationale: Borrowed human-factors and control-theory vocabulary motivates good manipulations but does
not license claims about model minds or real-world safety. Disciplined, behavioral definitions keep
the benchmark's conclusions defensible.

## Simulation & Evidence Constraints

- The environment progresses through declared time regimes (generous frozen ticks, budgeted frozen
  ticks, deterministic asynchronous time, natural wall-clock). Wall-clock experiments MUST NOT be
  treated as the primary causal condition and MUST be run only after the deterministic asynchronous
  benchmark is stable.
- Difficulty MUST be characterized by declared dimensions — runway utilization, traffic mix,
  conflict-graph structure, urgency, maneuver authority, uncertainty, and latency — rather than raw
  aircraft count alone, which MUST NOT be published as a standalone difficulty label.
- Latency channels (observation, teammate message, inference, command transmission, aircraft
  response) MUST be modeled as separate, independently configurable, timestamped channels.
- Scenario viability MUST be checked with offline optimization or approximate viability oracles for
  small and medium instances; deliberately overloaded or adversarial cases MUST be labeled as such.
- Safety oracles based on trajectory projection or decomposed reachability MUST NOT be presented as
  exact global guarantees.
- Multi-agent organization MUST NOT be prescribed; team structure is recorded as an emergent outcome
  and team conditions MUST be comparable against a solo controller with a matched total inference
  budget.

## Spec-Driven Delivery Gates

- Feature specifications MUST define prioritized, independently testable scenarios, edge cases,
  testable requirements, measurable success criteria, assumptions, and non-goals.
- Plans MUST resolve technical unknowns and generate applicable research, data-model, contract, and
  quickstart artifacts. Omitted artifacts require an explicit N/A rationale.
- Tasks MUST be dependency ordered, story grouped, independently verifiable, and path specific.
- Cross-artifact analysis and project workflow validation MUST pass before implementation.

## Governance

This constitution supersedes other project conventions where they conflict. All feature specs, plans,
tasks, ADRs, and reported results MUST comply with its principles; the plan-template Constitution
Check gate MUST verify compliance before implementation proceeds.

Amendments MUST be proposed in writing with rationale and migration impact, and are adopted only when
recorded in this file with an updated version and date. Versioning follows semantic versioning:
MAJOR for backward-incompatible governance or principle removals or redefinitions, MINOR for a new
principle or materially expanded guidance, PATCH for clarifications and non-semantic refinements.

Compliance is reviewed at every spec-driven gate (specify, plan, tasks, analyze, implement).
Violations MUST be resolved or recorded as an explicitly justified, time-bound exception in the
governing artifact before dependent work continues. Accepted ADRs remain the architecture contract
and MUST NOT contradict these principles.

**Version**: 1.0.0 | **Ratified**: 2026-08-06 | **Last Amended**: 2026-08-06
