# Contract: Trace / Record Wire Schema

The durable, versioned wire shape of a `Trace` and its `DecisionRecord`s. This is the
serialized form the replay verifier reads (EDC-001) and the attribution audit reads
(EDC-003). Values are integer base units; the encoding is canonical and deterministic
per [ADR 0001](../../../adrs/0001-deterministic-state-representation.md).

## Rules

- Every trace and record carries `schemaVersion` (integer). A reader whose
  `SCHEMA_VERSION` differs MUST reject, not partially read (FR-007, SC-004). The tag
  repeats on `Trace`, `DecisionRecord`, and `WorldSnapshot` so a fragment lifted out of
  a trace stays self-describing; there is one global version, not a per-entity version
  line (research.md R4), so nested tags agree with their enclosing document by
  construction.
- `msPerTick` is fixed by the schema, not chosen per trace: a reader MUST reject a
  trace whose `msPerTick` differs from `MS_PER_TICK`, since every recorded timestamp
  would otherwise change meaning. Changing the resolution is a schema-version change
  with a migration (ADR 0001).
- Only integers appear as numeric values — no floats, and not `-0` (ADR 0001).
- An unknown field encountered while reading MUST surface as an explicit error, never
  be dropped (spec.md Edge Cases, FR-011).
- The opaque payloads (`messages`, `margins`, `meta`) are uninterpreted by `core` but
  MUST lie in the canonical serializable value domain — `null`, booleans, strings,
  canonical integers, and arrays/objects of those, recursively — so a record that
  validates is guaranteed to persist and replay (FR-008, FR-012).
- Field order is fixed (or keys sorted); no insignificant whitespace; equal values
  encode to identical bytes (FR-008, SC-002).
- `proposed`, `intervention`, `applied` are always distinct fields; `intervention` may
  be null but the field is present (FR-006, SC-003).

## Shape (illustrative)

```
Trace
  schemaVersion: int
  seed: { root: int }
  msPerTick: int                          // MUST equal MS_PER_TICK
  records: [ DecisionRecord, ... ]        // ordered by index / simTime

DecisionRecord
  schemaVersion: int
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
