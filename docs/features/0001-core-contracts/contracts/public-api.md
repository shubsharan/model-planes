# Contract: `@model-planes/core` Public Surface

The exported surface other packages import. Signatures are illustrative of the
_contract_ (names, inputs, guarantees), not final source. All quantities are integer
base units per [ADR 0001](../../../adrs/0001-deterministic-state-representation.md).

## Constants

- `SCHEMA_VERSION: number` — the current integer schema version, stamped on every
  `WorldSnapshot`, `DecisionRecord`, and `Trace` (FR-007).
- `MS_PER_TICK: number` — declared tick resolution. Fixed by the schema: a `Trace`
  declaring any other `msPerTick` is rejected as a version mismatch (ADR 0001).

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
version mismatch, duplicate id, not integer, unknown field).

An unknown field is an error, not a value to drop: every parser accepts exactly the
field set its entity declares (spec.md Edge Cases). This is what stops a coordinate or
motion override riding along on an otherwise valid `Command` (FR-004).

A canonical integer excludes `-0`, which `serialize` would emit as `"0"` and so would
not round-trip identically (ADR 0001 representation hazards).

## Serialization (FR-008, SC-002)

```
serialize(value: Serializable): Uint8Array   // or canonical string
deserialize(bytes: Uint8Array): Result<Serializable, SchemaError>
```

Guarantees:

- `serialize(a)` is byte-identical to `serialize(b)` whenever `a` and `b` are logically
  equal — on every platform and process.
- `deserialize(serialize(v))` deep-equals `v`.
- `deserialize` rejects input whose `schemaVersion` differs from `SCHEMA_VERSION`,
  including a version that is not an integer at all (FR-007, SC-004).

```
requireCanonicalValue(field, value): Result<T, SchemaError>
requireCanonicalRecord(field, value): Result<Record<string, unknown>, SchemaError>
```

The canonical serializable value domain — `null`, booleans, strings, canonical
integers, and arrays/plain objects of those, recursively. Used to validate the opaque
payloads `core` does not otherwise interpret, so that a value which validates is
guaranteed to serialize.

## Units (FR-009)

```
toBaseUnit(quantity): Result<number, SchemaError>         // exact, or rejected
quantizeToBaseUnit(quantity): Result<number, SchemaError> // round-half-to-even
fromBaseUnit(value, toUnit): Result<number, SchemaError>  // exact where representable
```

- A missing or ambiguous unit is rejected by all three; there is no implicit default.
- `toBaseUnit` converts exactly or rejects: a quantity that does not land on a whole
  base unit (150 ms against a 100 ms tick) is an error, not a rounded value.
- `quantizeToBaseUnit` is the declared, versioned boundary rounding ADR 0001 requires
  for values leaving transient floating-point computation to enter state, a command, or
  the trace. A sub-unit remainder rounds half-to-even; changing that rule is a
  schema-version change with a migration.
- Both evaluate the conversion in exact integer arithmetic over the input's decimal
  mantissa, never by scaling in binary floating point, so no spurious residue can make
  an exactly-representable quantity read as inexact. A magnitude past the exact integer
  range is rejected rather than silently approximated.

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
