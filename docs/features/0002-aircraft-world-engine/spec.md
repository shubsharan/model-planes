---
status: Pending
---

# Feature Specification: Aircraft World Engine

- **Branch**: `feature/0002-aircraft-world-engine`
- **Epic**: [Deterministic Simulator](../../epics/0001-deterministic-simulator/epic.md)
- **Created**: 2026-08-06
- **PR**: Pending
- **Input**: User description: "FEAT-0002 Aircraft plant and tick engine, from the Deterministic Simulator epic. Given state and commands, aircraft motion advances deterministically under explicit versioned rules within per-aircraft performance limits. Depends on FEAT-0001 Core Contracts."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Advance the world deterministically (Priority: P1)

A benchmark author takes a valid world state (aircraft and runways as defined by the
core contracts), advances it one tick at a time with no commands, and watches every
aircraft continue on its current heading, speed, and altitude by dead reckoning. Running
the same starting state through the same number of ticks — on any machine, any number
of times — produces exactly the same resulting states, value for value.

**Why this priority**: Determinism is the epic's foundation gate (EDC-001). Every later
capability — command handling, replay, scoring — is only meaningful if the bare
advancement of time is exactly reproducible. This story alone is a usable MVP: a
deterministic dead-reckoning world.

**Independent Test**: Can be fully tested by advancing a hand-built snapshot N ticks
with an empty command stream, twice, and comparing the two resulting state sequences
for exact equality; and by checking positions against hand-computed expected motion.

**Acceptance Scenarios**:

1. **Given** a valid world snapshot with one aircraft at a known position, heading, and
   speed, **When** the world advances one tick, **Then** the aircraft's new position is
   exactly the declared motion rule applied to its prior state, and all other fields are
   unchanged.
2. **Given** any valid world snapshot, **When** the world is advanced N ticks twice from
   the same input, **Then** the two resulting state sequences are exactly identical,
   including every intermediate tick.
3. **Given** a valid world snapshot, **When** the world advances, **Then** the resulting
   snapshot is itself valid under the core contracts (integer base units, ranges,
   unique ids) and its simulation time has advanced by exactly one tick.

---

### User Story 2 - Command an aircraft within its performance limits (Priority: P2)

A scripted controller issues vocabulary commands — assign heading, assign altitude,
assign speed — against observed state. Each commanded aircraft converges toward its
assigned target over subsequent ticks, never changing heading, speed, altitude, or
climb/descent faster than its declared per-aircraft performance limits allow. The
command's effective time is honored: nothing changes before the tick at which the
command takes effect.

**Why this priority**: Commanded motion is the world engine's purpose — controllers exist to
steer aircraft — but it is only trustworthy on top of the deterministic advancement in
Story 1. Advances EDC-002 (dynamics bounds hold under scripted controllers).

**Independent Test**: Can be fully tested by scripting command sequences against known
aircraft and verifying per-tick convergence rates never exceed the aircraft's limits,
and that targets are eventually reached and held.

**Acceptance Scenarios**:

1. **Given** an aircraft with a declared maximum turn rate, **When** it is assigned a
   new heading, **Then** its heading changes by at most the maximum turn rate per tick,
   turning in the shorter direction, until it exactly reaches and holds the target.
2. **Given** an aircraft with declared climb and descent rate limits, **When** it is
   assigned a new altitude, **Then** its altitude changes by at most the applicable rate
   per tick until it exactly reaches and holds the target, and never goes below ground.
3. **Given** an aircraft with declared speed limits, **When** it is assigned a new
   speed inside its limits, **Then** its speed converges to the target and its speed at
   every tick remains within its declared minimum and maximum.
4. **Given** a command whose effective time is a future tick, **When** the world
   advances, **Then** the aircraft's motion is unaffected until that tick arrives, and
   the command takes effect exactly at its effective tick.

---

### User Story 3 - Reject what the rules forbid (Priority: P3)

A scripted controller issues commands the rules forbid — a speed outside the aircraft's
declared limits, a command targeting an aircraft that does not exist, a command whose
effective time already passed. The world engine refuses each one with an explicit, recorded
reason and leaves the world state untouched; nothing is ever silently applied, silently
clamped, or silently dropped.

**Why this priority**: This is the epic's invariant-breach scenario (EDC-002): the
simulator stays authoritative regardless of controller behavior. It matters after
Stories 1–2 because there must first be legal motion to protect.

**Independent Test**: Can be fully tested by scripting each forbidden command category
and verifying the world state is unchanged, the rejection and its reason are reported,
and subsequent legal commands still work.

**Acceptance Scenarios**:

1. **Given** an aircraft with a declared maximum speed, **When** a command assigns a
   speed above that maximum, **Then** the command is rejected with a stated reason and
   the aircraft's motion is unchanged.
2. **Given** a command targeting an aircraft id not present in the world, **When** it is
   submitted, **Then** it is rejected with a stated reason and no aircraft is affected.
3. **Given** a command whose effective time is earlier than the current simulation
   time, **When** it is submitted, **Then** it is rejected as stale with a stated
   reason rather than applied retroactively or silently deferred.

---

### Edge Cases

- Heading targets that cross the 0°/360° wrap point must turn in the shorter
  direction and settle exactly on the target, never oscillating around the wrap.
- Two commands of the same kind for the same aircraft effective at the same tick: the
  later-submitted command supersedes the earlier one, and both remain observable to the
  caller (supersession is explicit, not silent loss).
- Commands of different kinds for the same aircraft at the same tick (e.g. heading and
  speed) all apply together.
- An aircraft that reaches the boundary of the terminal airspace is flagged as having
  exited in that tick's outcome; it is never reported at a position outside the
  declared bounds.
- An aircraft whose fuel-or-time window reaches zero is flagged as exhausted in that
  tick's outcome and continues under the declared exhaustion rule; exhaustion is never
  silent.
- An altitude target of zero (ground level) is reachable; altitude never goes negative.
- A speed assignment equal to a limit boundary (exactly minimum or maximum) is legal.
- Advancing a world with zero aircraft is legal and yields only a time advance.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The world engine MUST advance a valid world state by exactly one tick at a time,
  producing a new valid world state; the input state is never mutated.
- **FR-002**: Advancement MUST be a pure function of (current state, commands effective
  at that tick, declared ruleset): no wall-clock time, no unseeded randomness, no
  hidden state may influence the result. Identical inputs always produce exactly
  identical outputs, on every platform.
- **FR-003**: Every quantity in every produced state MUST remain in the declared
  integer base units of the core contracts; any intermediate computation is quantized
  at the boundary under the declared rounding rule ([ADR 0001](../../adrs/0001-deterministic-state-representation.md)).
- **FR-004**: Aircraft motion MUST follow explicit, versioned motion rules: position
  advances from heading and speed; heading, altitude, and speed converge toward
  assigned targets. The ruleset carries a declared version, and any rule change is a
  version change.
- **FR-005**: Per-aircraft performance limits MUST bound every per-tick change: speed
  stays within declared minimum/maximum, altitude change within climb/descent rate
  limits, heading change within the turn rate limit. No command can cause a limit to
  be exceeded at any tick.
- **FR-006**: Commands MUST take effect exactly at their effective tick, never before.
  The world engine MUST accept exactly the vocabulary's three motion commands — assign
  heading, assign altitude, assign speed — and MUST NOT accept the remaining
  vocabulary (hold, runway and approach/landing commands, divert) at all. Those kinds
  are outside this feature's control surface, not unimplemented within it: the world
  engine offers no way to submit one, so no run can record one as applied.
- **FR-007**: The world engine MUST reject — with an explicit machine-readable reason, leaving
  state untouched — any command that is out of the target aircraft's limits, targets an
  unknown aircraft, is effective in the past, or is otherwise illegal under the
  declared rules. Rejection MUST never be silent, and acceptance MUST never modify the
  command.
- **FR-008**: Each tick outcome MUST report, distinctly: the commands applied, the
  commands rejected (with reasons), and per-aircraft events (airspace exit, fuel/time
  exhaustion, target reached) — sufficient for a caller to assemble the trace records
  defined by the core contracts.
- **FR-009**: Each aircraft's fuel-or-time window MUST decrease by the declared
  per-tick amount, and reaching zero MUST raise an explicit exhaustion event governed
  by a declared rule.
- **FR-010**: An aircraft MUST never be reported outside the declared airspace bounds
  or below ground level; reaching a bound raises an explicit event under a declared
  rule rather than producing an out-of-range state.

### Key Entities

- **World state**: the aircraft-and-runways snapshot defined by the core contracts;
  the world engine consumes one and produces the next.
- **Aircraft**: position, heading, speed, class, performance limits, separation
  requirement, fuel-or-time window — all as declared in the core contracts; the world
  engine additionally tracks each aircraft's assigned targets (heading, altitude, speed)
  between ticks.
- **Command**: a vocabulary instruction from the core contracts, carrying its observed
  and effective ticks; the world engine is the authority that decides legality and applies it.
- **Tick outcome**: the result of one advancement — the new world state plus applied
  commands, rejected commands with reasons, and per-aircraft events.
- **Ruleset version**: the declared identifier of the motion and legality rules in
  force, recorded so any rule change is distinguishable in preserved runs.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Advancing the same starting state with the same command stream produces
  exactly identical state sequences in 100% of repeated runs, including across
  different machines and operating systems.
- **SC-002**: 100% of out-of-limits, unknown-target, and stale commands are rejected
  with a stated reason, and 0% of them alter world state.
- **SC-003**: For every commanded target in a validation suite spanning all three
  motion commands, the aircraft reaches its target within the minimum number of ticks
  its declared limits permit, and holds it thereafter — with zero overshoot beyond one
  quantization step.
- **SC-004**: Across validation runs spanning low, near-capacity, and overload traffic
  counts, zero produced states violate a core-contract validation rule or a declared
  dynamics bound.
- **SC-005**: A benchmark author can advance a 50-aircraft world through one hour of
  simulated time in under one minute of real time on commodity hardware.

## Assumptions

- Motion is modelled in the simplified but explicit style the proposal requires:
  straight-line dead reckoning from heading and speed, with independent convergence of
  heading, altitude, and speed toward assigned targets at limit-bounded rates. No
  banking, acceleration curves, or aerodynamic modelling — the epic explicitly warns
  against over-detailed dynamics.
- Out-of-limits commands are **rejected**, not clamped: the epic's invariant-breach
  scenario requires illegal commands to be "rejected or measured, never silently
  applied", and rejection keeps the raw-proposal-versus-applied distinction clean for
  the trace.
- Stale commands (effective time before the current tick) are rejected rather than
  deferred; in the generous frozen-tick regime this feature serves, a well-behaved
  caller can always choose a legal effective tick.
- The fuel-or-time window decrements by one unit per tick as the declared default rule;
  exhaustion flags the aircraft but does not remove it — removal policy belongs to
  later features (divert/scoring).
- Airspace exit flags the aircraft and freezes it at the boundary as the declared
  default rule; interpretation (divert, scoring) belongs to later features.
- Runway interaction (approach capture, landing, occupancy) is deferred to the runway
  state machine feature; this world engine treats runways as static geometry.
- The six non-motion vocabulary kinds are outside this feature's control surface
  entirely, rather than accepted-and-ignored. Accepting them would make a run record
  that a landing clearance was *applied* during a tick in which clearances carry no
  meaning — a false statement in exactly the field the trace schema exists to keep
  honest. Excluding them at the interface makes the gap a structural fact, and the
  later widening a visible change rather than a silent reinterpretation of what an
  older run meant. Whether those kinds survive as measurement instruments at all is an
  open question on the parent epic, not a question this feature answers.
- Wind and response jitter remain declared-but-inactive seeded hooks, per the epic's
  boundary; no stochastic process runs in this feature.
- Scripted controllers used in validation are test fixtures, not products of this
  feature.

## Non-Goals

- Runway state machines and legal runway transitions (FEAT-0003 in the epic plan),
  including any handling of the six non-motion vocabulary kinds.
- Separation measurement and violation flagging (FEAT-0004).
- Seeded scenario generation (FEAT-0005) and the replay trace file/verifier
  (FEAT-0006) — this feature only produces outcomes sufficient for them.
- Safety filters, legality interventions beyond world-engine-rule rejection, scoring, or any
  controller intelligence.
- Time regimes beyond generous frozen ticks; latency channels; active wind or jitter
  processes.

## Architecture Decisions

- [Deterministic State Representation](../../adrs/0001-deterministic-state-representation.md) —
  governs the integer base units, boundary quantization, and rounding rule this
  world engine's dynamics must respect.
