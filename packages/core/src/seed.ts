// The reproducible randomness source (FR-010): from a single scenario seed,
// independent sub-seeds can be derived deterministically, so any declared
// stochastic process is reproducible on every run and every process
// (SC-005). Uses a pure integer hash — no Math.random, no Date.now, no
// platform-dependent transcendental functions — so the result is identical
// across runs and processes by construction.
import { err, ok, requireInteger, schemaError, type Result } from "./validate.ts";

/** The reproducible randomness source for a run. */
export interface Seed {
  readonly root: number;
}

export function parseSeed(input: unknown): Result<Seed> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return err(schemaError("Seed", "wrong-kind", "Seed must be an object"));
  }
  const root = requireInteger("Seed.root", (input as Record<string, unknown>)["root"]);
  if (!root.ok) return err(root.error);
  return ok({ root: root.value });
}

/** 32-bit FNV-1a hash — pure, deterministic, integer-only. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Derive an independent sub-seed from `seed` and a `label` (or index). Pure
 * and deterministic: identical `(seed, label)` yields an identical sub-seed
 * on every run and process (FR-010, SC-005).
 */
export function deriveSubSeed(seed: Seed, label: string | number): Seed {
  // Disjoint prefixes per branch, not a bare `label` for strings: without
  // this a string label starting with the numeric-index marker (`"#3"`)
  // would collide with the derivation for the index `3`.
  const labelKey = typeof label === "number" ? `n:${label}` : `s:${label}`;
  return { root: fnv1a(`${seed.root}:${labelKey}`) };
}
