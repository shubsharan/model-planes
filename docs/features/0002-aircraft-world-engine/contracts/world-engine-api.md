# Contract: World Engine Public API (`@model-planes/sim`)

The exported surface this feature adds to `packages/sim/src/index.ts`. Everything is
pure and synchronous; no I/O, no clocks, no randomness. Types referenced from
`@model-planes/core` are used as-is — this package re-exports nothing from `core`.

## Constants

```ts
/** Version of the motion + legality ruleset in force. Any rule change increments it. */
export const RULESET_VERSION: number; // starts at 1
```

## Types

```ts
import type { Command, Mm, Millideg, MmPerSec, Tick, WorldSnapshot } from "@model-planes/core";

/**
 * The world engine's control surface: exactly the three vocabulary kinds that move an
 * aircraft. Narrowed from core's `Command`, so any real command of these kinds is
 * assignable without conversion.
 *
 * The other six kinds (`hold`, `assignRunway`, `clearApproach`, `clearLand`,
 * `goAround`, `divert`) are authorizations and declarations, not kinematic inputs,
 * and are deliberately unrepresentable here — see the guarantees below. FEAT-0003
 * widens this union when it has runway semantics to attach.
 */
export type MotionCommand = Extract<
  Command,
  { kind: "assignHeading" | "assignAltitude" | "assignSpeed" }
>;

/** Active convergence targets + admitted-but-future commands for one aircraft. */
export interface AircraftAssignments {
  readonly targetHeading?: Millideg;
  readonly targetAltitude?: Mm;
  readonly targetSpeed?: MmPerSec;
  readonly pending: readonly MotionCommand[]; // sorted by (effectiveAt, admission order)
}

/** Complete, immutable world engine working state. */
export interface WorldEngineState {
  readonly snapshot: WorldSnapshot;
  readonly assignments: ReadonlyMap<string, AircraftAssignments>;
  readonly exited: ReadonlySet<string>;
  readonly exhausted: ReadonlySet<string>;
}

/** Every member is a controller error. There is no "unsupported kind" member. */
export const REJECTION_REASONS = [
  "unknownTarget",
  "staleEffectiveAt",
  "speedOutOfLimits",
  "altitudeOutOfRange",
  "headingOutOfRange",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export interface CommandRejection {
  readonly command: MotionCommand; // exactly as proposed, never edited
  readonly reason: RejectionReason;
  readonly detail: string; // non-normative
}

export interface CommandSupersession {
  readonly superseded: MotionCommand;
  readonly by: MotionCommand;
}

/** The dimension a `targetReached` event refers to. Named so a caller can switch
 *  on it without restating the union. */
export type TargetDimension = "heading" | "altitude" | "speed";

export type WorldEngineEvent =
  | { readonly kind: "airspaceExited"; readonly aircraftId: string; readonly tick: Tick }
  | { readonly kind: "fuelExhausted"; readonly aircraftId: string; readonly tick: Tick }
  | {
      readonly kind: "targetReached";
      readonly aircraftId: string;
      readonly tick: Tick;
      readonly dimension: TargetDimension;
    };

export interface TickOutcome {
  readonly rulesetVersion: number;
  readonly state: WorldEngineState; // snapshot.simTime advanced by exactly 1
  readonly applied: readonly MotionCommand[]; // every entry changed a target
  readonly rejected: readonly CommandRejection[];
  readonly superseded: readonly CommandSupersession[];
  readonly events: readonly WorldEngineEvent[]; // ordered by aircraft id, then kind
}
```

## Functions

```ts
import type { Result } from "@model-planes/core";

/**
 * Validate a snapshot (via the core parser) and wrap it as an initial WorldEngineState
 * with no assignments and no flags. Errs iff the snapshot is contract-invalid.
 */
export function createWorldEngineState(snapshot: unknown): Result<WorldEngineState>;

/**
 * Advance exactly one tick. Pure: never mutates `state` or `commands`; identical
 * inputs return structurally identical outcomes on every platform.
 *
 * `commands` are this tick's newly submitted proposals, in submission order.
 * Every submitted and newly-effective command appears in exactly one of
 * `applied` / `rejected` / `superseded` — nothing is silent.
 *
 * Total function on valid WorldEngineState — errs only on structural impossibility
 * (a WorldEngineState not produced by this API); command illegality is expressed as
 * `rejected`, not as an error.
 */
export function advanceTick(
  state: WorldEngineState,
  commands: readonly MotionCommand[],
): Result<TickOutcome>;
```

## Behavioral guarantees (normative)

1. **Determinism**: `advanceTick` is a pure function of `(state, commands, RULESET_VERSION)`.
   No `Math` transcendentals, wall clock, or randomness anywhere in the call graph.
2. **Contract validity**: `outcome.state.snapshot` always passes `parseWorldSnapshot`.
3. **Limit enforcement**: per-tick heading change ≤ `maxTurnRate`; altitude change ≤
   the applicable climb/descent per-tick bound; speed always in `[minSpeed, maxSpeed]`.
4. **Effective time**: no command influences motion before its `effectiveAt` tick;
   `effectiveAt < snapshot.simTime + 1` at submission ⇒ rejected `staleEffectiveAt`.
5. **Reject, never clamp**: an out-of-limits parameter rejects the whole command; an
   accepted command is applied byte-for-byte as proposed.
6. **Motion-only control surface**: `hold`, `assignRunway`, `clearApproach`,
   `clearLand`, `goAround`, and `divert` cannot be submitted — they are outside
   `MotionCommand` and rejected by the type checker, not at runtime. Consequently
   `applied` never contains an inert entry, and no run produced by this API can record
   that a clearance was applied. FEAT-0003 widens `MotionCommand` as a deliberate,
   reviewable API change; until then a caller holding a full `Command` must narrow it
   and decide for itself what to do with the rest.
7. **Boundary safety**: no reported position outside airspace bounds, no negative
   altitude; crossings clamp + flag (`airspaceExited`), exhaustion flags
   (`fuelExhausted`); both exactly once, at the transition tick.
