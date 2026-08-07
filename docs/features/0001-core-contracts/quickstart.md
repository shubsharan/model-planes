# Quickstart: Core Contracts

How a consuming package (sim, scenarios, controllers, harness) uses
`@model-planes/core`. Provider-free — no network, no model calls.

## Install / import

`core` is the workspace dependency sink; add it as a workspace dependency and import
types and helpers:

```ts
import {
  SCHEMA_VERSION,
  parseWorldSnapshot,
  serialize,
  deserialize,
  deriveSubSeed,
  type WorldSnapshot,
  type Command,
  type DecisionRecord,
} from "@model-planes/core";
```

## Read a snapshot, issue a command

```ts
// A controller observes the world it was given...
const snapshot: WorldSnapshot = parseWorldSnapshot(input).unwrap();

// ...and expresses intent only through the command vocabulary,
// stamping the observation time and the effective time.
const cmd: Command = {
  kind: "assignHeading",
  target: "AC123",
  params: { heading: 90_000 }, // 90.000° in millidegrees
  observedAt: snapshot.simTime,
  effectiveAt: snapshot.simTime + 1,
};
```

There is no API to set coordinates directly — that is the point (Constitution II).

## Record a decision and replay it

```ts
const record: DecisionRecord = {
  index: 0,
  observed: snapshot,
  messages: [],
  proposed: cmd,          // raw proposal preserved...
  intervention: null,     // ...separately from any intervention...
  applied: cmd,           // ...and from what was applied.
  result: { aircraft: [], runways: [] },
  margins: {},
  meta: { provider: "none", model: "scripted" },
};

const bytes = serialize({ schemaVersion: SCHEMA_VERSION, seed: { root: 42 }, msPerTick: 100, records: [record] });
const back = deserialize(bytes).unwrap();

// Determinism you can assert in a test:
//   serialize(back) is byte-identical to bytes
//   deserialize rejects bytes whose schemaVersion !== SCHEMA_VERSION
```

## Reproducible seeds

```ts
const wind = deriveSubSeed({ root: 42 }, "wind");
const jitter = deriveSubSeed({ root: 42 }, "jitter");
// Same inputs → same sub-seeds on every run and process.
```

## Verify (provider-free)

```bash
pnpm --filter @model-planes/core build
pnpm --filter @model-planes/core test
```

Acceptance checks to encode as tests:

- Round-trip: `deserialize(serialize(v))` deep-equals `v` (SC-002).
- Byte-identical: serializing equal values twice, and in a separate process, yields
  identical bytes (SC-002).
- Attribution: `proposed`, `intervention`, `applied` each retrievable on every record
  (SC-003).
- Version guard: reading a record with a different `schemaVersion` is rejected (SC-004).
- Seeds: `deriveSubSeed` is stable across runs (SC-005).
- Rejection: malformed/incomplete input is rejected, not defaulted (SC-006).
