// US1: malformed/incomplete AircraftState, RunwayState, and Command values
// are rejected rather than defaulted (FR-011, SC-006 for these entities).
import { describe, expect, it } from "vitest";
import { parseCommand, parseWorldSnapshot } from "../src/index.ts";

const validAircraft = {
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
};

const validRunway = {
  id: "09L",
  threshold1: { x: -2_000_000, y: 0, z: 0 },
  threshold2: { x: 2_000_000, y: 0, z: 0 },
  width: 45_000,
  closed: false,
};

function snapshotWith(overrides: { aircraft?: unknown[]; runways?: unknown[] }) {
  return {
    schemaVersion: 1,
    simTime: 0,
    aircraft: overrides.aircraft ?? [validAircraft],
    runways: overrides.runways ?? [validRunway],
  };
}

describe("AircraftState/RunwayState/Command validation rejects malformed input (US1, FR-011)", () => {
  it("accepts the valid fixture as a sanity baseline", () => {
    expect(parseWorldSnapshot(snapshotWith({})).ok).toBe(true);
  });

  it("rejects an AircraftState missing a required field", () => {
    const { id: _id, ...withoutId } = validAircraft;
    const result = parseWorldSnapshot(snapshotWith({ aircraft: [withoutId] }));
    expect(result.ok).toBe(false);
  });

  it("rejects an AircraftState with a heading out of range", () => {
    const result = parseWorldSnapshot(
      snapshotWith({ aircraft: [{ ...validAircraft, heading: 360_000 }] }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an AircraftState with a non-integer speed", () => {
    const result = parseWorldSnapshot(
      snapshotWith({ aircraft: [{ ...validAircraft, speed: 120_000.5 }] }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an AircraftState whose speed exceeds its own limits", () => {
    const result = parseWorldSnapshot(
      snapshotWith({ aircraft: [{ ...validAircraft, speed: 999_999 }] }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate aircraft ids in a WorldSnapshot", () => {
    const result = parseWorldSnapshot(snapshotWith({ aircraft: [validAircraft, validAircraft] }));
    expect(result.ok).toBe(false);
  });

  it("rejects a RunwayState whose thresholds coincide", () => {
    const result = parseWorldSnapshot(
      snapshotWith({ runways: [{ ...validRunway, threshold2: validRunway.threshold1 }] }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a RunwayState with non-positive width", () => {
    const result = parseWorldSnapshot(snapshotWith({ runways: [{ ...validRunway, width: 0 }] }));
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate runway ids in a WorldSnapshot", () => {
    const result = parseWorldSnapshot(snapshotWith({ runways: [validRunway, validRunway] }));
    expect(result.ok).toBe(false);
  });

  it("rejects a negative simTime", () => {
    const result = parseWorldSnapshot({ ...snapshotWith({}), simTime: -1 });
    expect(result.ok).toBe(false);
  });

  it("rejects a Command with an unknown kind", () => {
    const result = parseCommand({
      kind: "teleport",
      target: "AC1",
      params: {},
      observedAt: 0,
      effectiveAt: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a Command whose params don't match its kind", () => {
    const result = parseCommand({
      kind: "assignHeading",
      target: "AC1",
      params: { speed: 100 },
      observedAt: 0,
      effectiveAt: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a Command missing observedAt", () => {
    const result = parseCommand({
      kind: "hold",
      target: "AC1",
      params: {},
      effectiveAt: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a Command with a non-integer effectiveAt", () => {
    const result = parseCommand({
      kind: "hold",
      target: "AC1",
      params: {},
      observedAt: 0,
      effectiveAt: 1.5,
    });
    expect(result.ok).toBe(false);
  });
});
