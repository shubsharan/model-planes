# Quickstart: Aircraft World Engine

Drive the world engine end to end in a few lines. Everything is pure and deterministic —
run it twice, get byte-identical results.

## Advance a world and command an aircraft

```ts
import { assignHeading, asMillideg, asTick } from "@model-planes/core";
import { createWorldEngineState, advanceTick, RULESET_VERSION } from "@model-planes/sim";

// 1. Wrap a valid core WorldSnapshot (e.g. from a fixture) as world engine state.
const initial = createWorldEngineState(snapshot); // Result — errs iff contract-invalid
if (!initial.ok) throw new Error(initial.error.message);

// 2. Advance one tick with no commands: pure dead reckoning.
const t1 = advanceTick(initial.value, []);
if (!t1.ok) throw new Error(t1.error.message);

// 3. Command a turn, effective next tick, and keep advancing.
const cmd = assignHeading("AC-1", asMillideg(90_000), /* observedAt */ asTick(1), /* effectiveAt */ asTick(2));
const t2 = advanceTick(t1.value.state, [cmd]);
if (!t2.ok) throw new Error(t2.error.message);

console.log(RULESET_VERSION);            // rules in force, e.g. 1
console.log(t2.value.applied.length);    // 1 — the turn was admitted
console.log(t2.value.rejected);          // [] — nothing illegal
console.log(t2.value.state.snapshot);    // aircraft turning ≤ maxTurnRate per tick
```

## See a rejection (nothing is ever silent)

```ts
import { assignSpeed, asMmPerSec } from "@model-planes/core";

// Speed above the aircraft's declared maxSpeed → rejected, state untouched.
const tooFast = assignSpeed("AC-1", asMmPerSec(999_999_999), asTick(2), asTick(3));
const t3 = advanceTick(t2.value.state, [tooFast]);
if (t3.ok) {
  console.log(t3.value.rejected[0]?.reason); // "speedOutOfLimits"
}
```

## Prove determinism to yourself

```ts
import { deepStrictEqual } from "node:assert";

const runA = advanceTick(initial.value, []);
const runB = advanceTick(initial.value, []);
deepStrictEqual(runA, runB); // identical, always, on every platform
```

## Verify

```bash
pnpm --filter @model-planes/sim test
```

```bash
pnpm --filter @model-planes/sim check-types
```
