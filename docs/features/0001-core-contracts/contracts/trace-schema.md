# Contract: Trace / Record Wire Schema

The durable, versioned wire shape of a `Trace` and its `DecisionRecord`s. This is the
serialized form the replay verifier reads (EDC-001) and the attribution audit reads
(EDC-003). Values are integer base units; the encoding is canonical and deterministic
per [ADR 0001](../../../adrs/0001-deterministic-state-representation.md).

## Rules

- Every trace and record carries `schemaVersion` (integer). A reader whose
  `SCHEMA_VERSION` differs MUST reject, not partially read (FR-007, SC-004).
- Only integers appear as numeric values — no floats (ADR 0001).
- Field order is fixed (or keys sorted); no insignificant whitespace; equal values
  encode to identical bytes (FR-008, SC-002).
- `proposed`, `intervention`, `applied` are always distinct fields; `intervention` may
  be null but the field is present (FR-006, SC-003).

## Shape (illustrative)

```
Trace
  schemaVersion: int
  seed: { root: int }
  msPerTick: int
  records: [ DecisionRecord, ... ]        // ordered by index / simTime

DecisionRecord
  index: int
  observed: WorldSnapshot
  messages: [ opaque, ... ]               // controller messages / tool use, ordered
  proposed:   Command                     // raw, as emitted
  intervention: Intervention | null       // present, may be null
  applied:    Command                     // may equal proposed
  result: { aircraft: [AircraftState,...], runways: [RunwayState,...] }
  margins: { ... }                        // safety margins / scoring events
  meta: { provider, model, prompt, budget, latency, ... }

WorldSnapshot
  schemaVersion: int
  simTime: int                            // tick
  aircraft: [ AircraftState, ... ]        // unique ids
  runways:  [ RunwayState, ... ]          // unique ids

Command
  kind: CommandKind
  target: aircraftId
  params: { ... }                         // kind-specific, base units
  observedAt: int                         // tick of the observed snapshot
  effectiveAt: int                        // tick it applies
```

## Replay obligation

Given a `Trace` and its `seed`, re-running the recorded `applied` command stream against
a fresh run MUST reproduce a byte-identical serialized `Trace`. The verifier that
enforces this lives in `sim` (feature: replay trace and verifier); this contract only
guarantees the representation makes that comparison exact.
