// US3 Independent Test (spec.md): derive sub-seeds from a fixed seed twice
// and confirm identical results, including across processes (SC-005; FR-010).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deriveSubSeed, type Seed } from "../src/index.ts";

describe("reproducible seed derivation (US3, FR-010)", () => {
  const seed: Seed = { root: 42 };

  it("derives an identical sub-seed for the same (seed, label) on repeated calls", () => {
    const a = deriveSubSeed(seed, "wind");
    const b = deriveSubSeed(seed, "wind");
    expect(a).toEqual(b);
  });

  it("derives different sub-seeds for different labels", () => {
    const wind = deriveSubSeed(seed, "wind");
    const jitter = deriveSubSeed(seed, "jitter");
    expect(wind).not.toEqual(jitter);
  });

  it("derives different sub-seeds for different indices", () => {
    const a = deriveSubSeed(seed, 0);
    const b = deriveSubSeed(seed, 1);
    expect(a).not.toEqual(b);
  });

  it("derives an integer root sub-seed", () => {
    const derived = deriveSubSeed(seed, "wind");
    expect(Number.isInteger(derived.root)).toBe(true);
  });

  it("derives different sub-seeds from different root seeds with the same label", () => {
    const a = deriveSubSeed({ root: 42 }, "wind");
    const b = deriveSubSeed({ root: 43 }, "wind");
    expect(a).not.toEqual(b);
  });

  it("derives an identical sub-seed across processes", () => {
    const scriptPath = fileURLToPath(
      new URL("./fixtures/derive-seed-subprocess.mts", import.meta.url),
    );
    const output = execFileSync(process.execPath, [scriptPath], { encoding: "utf8" });
    const fromSubprocess = JSON.parse(output) as Seed;
    const inProcess = deriveSubSeed(seed, "wind");
    expect(fromSubprocess).toEqual(inProcess);
  });
});
