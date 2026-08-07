// Proves the test harness resolves the `@model-planes/core` workspace dependency
// through `.ts`-extension ESM imports before any world engine work depends on it.
import { describe, expect, it } from "vitest";
import { MS_PER_TICK, SCHEMA_VERSION } from "@model-planes/core";

describe("sim test harness", () => {
  it("resolves the core workspace dependency", () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(MS_PER_TICK).toBe(100);
  });
});
