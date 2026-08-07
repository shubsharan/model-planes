# Contract: `@model-planes/core` Public Surface

The exported surface other packages import. Signatures are illustrative of the
*contract* (names, inputs, guarantees), not final source. All quantities are integer
base units per [ADR 0001](../../../adrs/0001-deterministic-state-representation.md).

## Constants

- `SCHEMA_VERSION: number` — the current integer schema version, stamped on every
  `WorldSnapshot` and `Trace` (FR-007).
- `MS_PER_TICK: number` — declared tick resolution.

## Types (see [data-model.md](../data-model.md) for fields)

`AircraftClass`, `CommandKind`, `Vec3`,
`AircraftPerformanceLimits`, `AircraftState`, `RunwayState`, `WorldSnapshot`, `Command`,
`Intervention`, `DecisionRecord`, `Trace`, `Seed`.

## Validation (FR-011, SC-006)

Each constructible entity has a parse/validate entry point that returns a typed value or
a structured error — malformed or incomplete input is rejected, never silently
defaulted.

```
parseWorldSnapshot(input: unknown): Result<WorldSnapshot, SchemaError>
parseCommand(input: unknown): Result<Command, SchemaError>
parseDecisionRecord(input: unknown): Result<DecisionRecord, SchemaError>
parseTrace(input: unknown): Result<Trace, SchemaError>
```

`SchemaError` names the offending field and reason (missing, out-of-range, wrong kind,
version mismatch).

## Serialization (FR-008, SC-002)

```
serialize(value: Serializable): Uint8Array   // or canonical string
deserialize(bytes: Uint8Array): Result<Serializable, SchemaError>
```

Guarantees:

- `serialize(a)` is byte-identical to `serialize(b)` whenever `a` and `b` are logically
  equal — on every platform and process.
- `deserialize(serialize(v))` deep-equals `v`.
- `deserialize` rejects input whose `schemaVersion` differs from `SCHEMA_VERSION`
  (FR-007, SC-004).

## Units (FR-009)

```
toBaseUnit(quantity, fromUnit): number   // exact; throws/Errs on ambiguous unit
fromBaseUnit(value, toUnit): number       // exact where representable
```

Conversions are exact; a missing or ambiguous unit is rejected.

## Seeds (FR-010, SC-005)

```
deriveSubSeed(seed: Seed, label: string | number): Seed   // pure, deterministic
```

Identical `(seed, label)` yields an identical sub-seed on every run and process.

## Command vocabulary constructors (FR-002, FR-004)

Helpers that build each `CommandKind` with `observedAt`/`effectiveAt` and validated
base-unit params. There is deliberately **no** API to set an aircraft's coordinates or
override motion — intent flows only through these commands (Constitution II).

## Boundary (FR-012)

This package exports shapes, validation, serialization, units, and seeds only. It
exports no dynamics, separation math, scenario generation, scoring, or safety logic.
