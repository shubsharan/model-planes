// Local constructors for core's `Result` shape.
//
// `@model-planes/core` exports the `Result` *type* and `SchemaValidationError`,
// but its `ok`/`err` constructors are internal to the package's `exports` map.
// Rather than widen the public core surface solely for simulator constructors,
// `sim` builds the identical structure here. These are structurally
// the same values core produces: an `ok`/`error` discriminant plus an `unwrap`
// that throws the core error class, so a `Result` from `sim` and one from `core`
// are interchangeable at every call site and compare equal field by field.
import { type Result, type SchemaError, SchemaValidationError } from "@model-planes/core";

export function ok<T>(value: T): Result<T> {
  return { ok: true, value, unwrap: () => value };
}

export function err<T>(error: SchemaError): Result<T> {
  return {
    ok: false,
    error,
    unwrap(): T {
      throw new SchemaValidationError(error);
    },
  };
}
