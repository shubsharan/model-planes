// Shared fixtures for US2 (and later Polish) specs: a WorldSnapshot, a
// DecisionRecord where an intervention downgraded a clearLand proposal to a
// goAround, and a one-record Trace wrapping it.
import {
  SCHEMA_VERSION,
  asTick,
  clearLand,
  goAround,
  parseWorldSnapshot,
  type Command,
  type DecisionRecord,
  type Trace,
  type WorldSnapshot,
} from "../../src/index.ts";

export function buildSampleSnapshot(): WorldSnapshot {
  return parseWorldSnapshot({
    schemaVersion: SCHEMA_VERSION,
    simTime: 0,
    aircraft: [
      {
        id: "AC1",
        position: { x: 0, y: 0, z: 3_000_000 },
        heading: 90_000,
        speed: 120_000,
        class: "medium",
        limits: {
          minSpeed: 60_000,
          maxSpeed: 250_000,
          maxClimbRate: 15_000,
          maxDescentRate: 15_000,
          maxTurnRate: 300,
        },
        separationRequirement: { horizontal: 5_556_000, vertical: 300_000 },
        fuelOrWindowRemaining: 3600,
      },
    ],
    runways: [
      {
        id: "09L",
        threshold1: { x: -2_000_000, y: 0, z: 0 },
        threshold2: { x: 2_000_000, y: 0, z: 0 },
        width: 45_000,
        closed: false,
      },
    ],
  }).unwrap();
}

/** A decision where a safety intervention downgraded a clearLand proposal to a goAround. */
export function buildSampleRecord(): DecisionRecord {
  const observed = buildSampleSnapshot();
  const observedAt = asTick(observed.simTime);
  const effectiveAt = asTick(observed.simTime + 1);

  const proposed: Command = clearLand("AC1", observedAt, effectiveAt);
  const applied: Command = goAround("AC1", observedAt, effectiveAt);
  const aircraft = observed.aircraft[0];
  if (aircraft === undefined) {
    throw new Error("fixture invariant: sample snapshot must have one aircraft");
  }

  return {
    index: 0,
    observed,
    messages: [{ role: "assistant", content: "clearing AC1 to land" }],
    proposed,
    intervention: { reason: "safety", detail: "runway occupied" },
    applied,
    result: { aircraft: [aircraft], runways: observed.runways },
    margins: { verticalMarginMm: 300_000 },
    meta: { provider: "none", model: "scripted" },
  };
}

export function buildSampleTrace(): Trace {
  return {
    schemaVersion: SCHEMA_VERSION,
    seed: { root: 42 },
    msPerTick: 100,
    records: [buildSampleRecord()],
  };
}
