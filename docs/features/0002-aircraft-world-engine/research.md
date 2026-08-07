# Phase 0 Research: Aircraft World Engine

Resolves the unknowns behind a cross-platform, byte-identical tick engine on top of the
FEAT-0001 contracts. Each decision is a versioned rule of the world engine; changing one is a
`RULESET_VERSION` change.

## R1 — Deterministic trigonometry (position update)

- **Decision**: Implement `sin`/`cos` in `packages/sim/src/trig.ts` as a fixed odd/even
  minimax polynomial over a quarter-wave, evaluated with only IEEE-754 basic operations
  (`+ - * /`), taking millidegree integers in `[0, 360000)` and returning doubles that
  are immediately quantized. **`Math.sin`/`Math.cos` are forbidden in the state path.**
- **Rationale**: IEEE-754 requires correctly rounded basic operations, so a fixed
  polynomial with fixed evaluation order gives bit-identical doubles on every platform.
  Library transcendentals carry no such guarantee (ADR 0001 explicitly leaves dynamics
  determinism to `sim`). Input domain is finite (360 000 millidegrees) with exact
  quarter-wave symmetry, so range reduction is exact integer arithmetic — no argument-
  reduction error.
- **Alternatives considered**: (a) 360 000-entry lookup table — deterministic but ~2.9 MB
  per function and still needs a generation story; rejected as avoidable bulk, though it
  remains a fallback if polynomial cost shows up in SC-005 profiling. (b) Integer CORDIC
  — deterministic but more code and iterations for the same accuracy. (c) `Math.sin`
  plus per-platform tolerance — violates byte-identity outright.

## R2 — Per-tick motion integration and quantization

- **Decision**: Each tick, for each aircraft, in a declared fixed order: (1) update
  heading toward target, clamped by `maxTurnRate` (exact integer math, millidegrees);
  (2) update speed to target (see R4); (3) update altitude toward target, clamped by
  `maxClimbRate`/`maxDescentRate` scaled to per-tick mm (exact integer math); (4) advance
  horizontal position `Δx = speed·(MS_PER_TICK/1000)·cos(heading)`,
  `Δy = speed·(MS_PER_TICK/1000)·sin(heading)` using the *new* heading and speed, with each
  component quantized round-half-to-even to integer mm at the boundary. No sub-unit
  remainder is carried between ticks.
- **Rationale**: Heading/altitude/speed updates are exact integer arithmetic — only the
  position projection touches floats, through R1 trig, and it is quantized immediately
  under ADR 0001's declared rounding. Carrying no remainder keeps the world engine a pure
  function of the snapshot (nothing hidden from replay); the per-tick rounding is a
  declared, versioned modelling choice, not drift. Order-of-update (steer, then move)
  is fixed and documented so there is exactly one legal next state.
- **Alternatives considered**: Sub-mm residual accumulators (breaks "state is the whole
  truth" and forces a schema change to persist them); midpoint/RK integration (needless
  precision for a supervisory-control microworld the proposal wants simplified).

## R3 — Heading target semantics and wrap

- **Decision**: Turn along the shorter signed difference in `[−180000, 180000)`
  millidegrees; an exact 180000 tie turns clockwise (positive). Per tick the heading
  moves `min(|diff|, maxTurnRate)` toward the target and snaps exactly onto it when
  within one tick's authority. All arithmetic is integer modulo 360000.
- **Rationale**: Shortest-direction with a declared tie-break is the only rule with a
  unique deterministic answer at every input; snapping guarantees targets are exactly
  reached and held (spec SC-003, no oscillation around the wrap).
- **Alternatives considered**: Always-clockwise turns (longer paths, surprises
  controllers); floating-point angle differences (unnecessary — millidegrees are ints).

## R4 — Speed convergence rule

- **Decision**: Speed steps to the assigned target at the command's effective tick
  (instantaneous), constrained to `[minSpeed, maxSpeed]` at admission time; no
  acceleration limit in ruleset v1.
- **Rationale**: `AircraftPerformanceLimits` (core, FEAT-0001) declares no acceleration
  bound, so inventing one would add hidden dynamics the contracts cannot express. The
  epic warns against over-detailed dynamics; heading and altitude already provide the
  rate-limited-convergence behavior the benchmark studies. The rule is explicit and
  versioned — adding an acceleration limit later is a ruleset (and contracts) revision.
- **Alternatives considered**: A fixed default acceleration (arbitrary, invisible in the
  contracts, and impossible for a controller to read off the snapshot); clamping
  out-of-range speed targets (violates reject-don't-clamp, spec FR-007).

## R5 — World engine state and target persistence

- **Decision**: The world engine operates on a `WorldEngineState = { snapshot, assignments }`
  where `assignments` maps aircraft id → active targets (heading?, altitude?, speed?) plus
  pending not-yet-effective commands. `assignments` is fully reconstructable by folding
  the applied-command log; `advanceTick(engineState, commands)` returns a fresh
  `TickOutcome` and never mutates its input.
- **Rationale**: `WorldSnapshot` deliberately carries no targets (FEAT-0001 keeps
  derived intent out of observed state), yet convergence needs them between ticks.
  Making them an explicit, reconstructable value preserves replay sufficiency
  (Constitution I): snapshot + command stream ⇒ identical assignments ⇒ identical run.
- **Alternatives considered**: Stuffing targets into `AircraftState` (a core schema
  change FEAT-0001 explicitly avoided); re-deriving targets from the full command log
  every tick (O(log) per tick and forces the world engine to carry history — the fold is the
  same math done incrementally).

## R6 — Command admission, staleness, and supersession

- **Decision**: At each tick the world engine admits commands in submission order. A command is
  rejected — with a machine-readable reason, state untouched — when its target id is
  unknown, its `effectiveAt` is before the current tick, or its parameter is outside
  the target's limits (speed outside `[min,max]`; altitude above the airspace ceiling
  or negative). Kinds outside the motion set are not a rejection case: they are
  unrepresentable at this interface (R7). Among admitted commands of the
  same kind for the same aircraft and the same effective tick, the last submitted wins
  and the earlier is reported superseded (an explicit outcome, not a rejection).
  Different kinds compose freely.
- **Rationale**: Spec FR-006/FR-007 and the epic's invariant-breach scenario demand
  explicit, never-silent handling of every proposal. Last-wins with an explicit
  supersession report matches the trace contract's insistence that nothing is collapsed
  or lost. Staleness is rejected (not deferred) because in the generous frozen-tick
  regime a caller can always pick a legal effective tick — deferral would silently
  rewrite controller intent.
- **Alternatives considered**: First-wins (surprising — later corrections are the point
  of supervisory control); applying stale commands at the current tick (silently alters
  intent; belongs to the latency-regime features if ever).

## R7 — Vocabulary coverage in this feature

- **Decision**: The world engine's control surface is exactly `assignHeading`,
  `assignAltitude`, `assignSpeed`. `advanceTick` takes a narrowed `MotionCommand`
  union, not the full core `Command`, so `hold`, `assignRunway`, `clearApproach`,
  `clearLand`, `goAround`, and `divert` **cannot be submitted to this world engine at all**.
  FEAT-0003 widens the signature when it has runway semantics to attach; that widening
  is a deliberate, reviewable API change.
- **Rationale**: Those six are authorizations and declarations, not kinematic inputs —
  nothing in them moves an aircraft, which is all this feature does. Accepting them
  would put a landing clearance in `TickOutcome.applied`, the field a caller maps onto
  the core `DecisionRecord.applied` ("the command actually applied"), during ticks in
  which clearances have no meaning — a false statement in precisely the field
  Constitution IV keeps distinct from the raw proposal. Excluding them at the type
  level makes the gap a compile-time fact rather than a runtime fiction: no run can
  claim a clearance was applied, because none can reach the world engine. There is also no
  cost to excluding them here, since this feature's only controllers are scripted test
  fixtures — nothing legitimate would emit one.
- **Alternatives considered**: (a) Admitting them as recorded no-ops — the original
  choice, rejected for the false-`applied` reason above. (b) Rejecting them with a
  dedicated reason — mislabels correct controller behavior as a controller error and
  pollutes the unsafe/illegal-command-rate metric the epic cares about. (c) A fourth
  `acknowledged` outcome bucket — honest, but machinery in service of routing commands
  to a component that has nothing to do with them.
- **Open beyond this feature**: whether those six kinds survive in the vocabulary at
  all. Much of what they express is derivable from direct kinematic control — a
  go-around is steering away, a hold is an orbit the agent constructs, a divert is
  leaving the airspace — and storing derived clearance state is what the FEAT-0001 data
  model deliberately avoided. Their remaining justification is as measurement
  instruments for the proposal's commitment-pressure variable and deferred-action
  outcomes, which need an observable declaration of future intent. Raised as an open
  question on the parent epic; not settled here.

## R8 — Boundary and resource events

- **Decision**: Events reported per tick, per aircraft: `airspaceExited` (motion would
  cross the declared bound: the aircraft is clamped to the boundary point, flagged, and
  frozen — position and altitude no longer advance), `fuelExhausted`
  (`fuelOrWindowRemaining` hits 0 after its per-tick decrement of 1; aircraft continues
  flying, flag is permanent), and `targetReached` (heading/altitude/speed exactly
  reached this tick). Altitude is additionally floored at 0 by the motion rule itself
  (never an out-of-range state).
- **Rationale**: Spec FR-008–FR-010 require explicit, never-silent boundary behavior
  while keeping interpretation (scoring, divert policy) out of scope. Freezing at the
  boundary keeps every reported position inside the contract's valid range, which
  `parseWorldSnapshot` enforces — an out-of-bounds position wouldn't even validate.
- **Alternatives considered**: Removing exited aircraft from the snapshot (removal
  policy is a later feature's decision; silent disappearance would be untraceable);
  letting positions exceed bounds with a flag (produces contract-invalid states).

## R9 — Testing and performance approach

- **Decision**: Vitest suites per user story (determinism, motion, legality, events)
  plus a performance smoke test asserting the SC-005 budget (36 000 ticks × 50 aircraft
  well under 60 s; test budget set to 10 s to leave margin). Determinism tests compare
  full state sequences via deep equality and re-validate every produced snapshot with
  `parseWorldSnapshot`. Cross-platform byte-identity is guaranteed by construction
  (R1/R2) and enforced in CI on at least one non-development platform when CI exists.
- **Rationale**: Vitest is the workspace standard (used by `core`). Sequence-level deep
  equality plus contract re-validation is exactly EDC-001/EDC-002 evidence at world-engine
  granularity.
- **Alternatives considered**: Golden-file byte snapshots — premature until the trace
  writer (FEAT-0006) defines the canonical file form; deep equality over parsed values
  is equivalent evidence here.
