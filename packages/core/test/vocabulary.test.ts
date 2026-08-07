// US1 Independent Test (spec.md): construct a WorldSnapshot, emit one of
// every CommandKind against it, and confirm each command references only
// the shared vocabulary (never raw coordinates) and carries both an
// observation timestamp and an effective time (FR-002, FR-003, FR-004).
import { describe, expect, it } from "vitest";
import {
  COMMAND_KINDS,
  SCHEMA_VERSION,
  asMillideg,
  asMm,
  asMmPerSec,
  asTick,
  assignAltitude,
  assignHeading,
  assignRunway,
  assignSpeed,
  clearApproach,
  clearLand,
  divert,
  goAround,
  hold,
  parseCommand,
  parseWorldSnapshot,
  type Command,
  type WorldSnapshot,
} from "../src/index.ts";

function buildSnapshot(): WorldSnapshot {
  const raw = {
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
  };
  return parseWorldSnapshot(raw).unwrap();
}

describe("command vocabulary (US1)", () => {
  it("exposes every field a controller and the simulator need without a parallel type", () => {
    const snapshot = buildSnapshot();
    const aircraft = snapshot.aircraft[0];
    const runway = snapshot.runways[0];
    expect(aircraft).toBeDefined();
    expect(runway).toBeDefined();
    expect(aircraft?.position).toBeDefined();
    expect(aircraft?.heading).toBe(90_000);
    expect(aircraft?.speed).toBe(120_000);
    expect(aircraft?.class).toBe("medium");
    expect(aircraft?.limits.maxTurnRate).toBe(300);
    expect(aircraft?.separationRequirement.horizontal).toBe(5_556_000);
    expect(aircraft?.fuelOrWindowRemaining).toBe(3600);
    expect(runway?.width).toBeGreaterThan(0);
    expect(runway?.closed).toBe(false);
  });

  it("emits one of every CommandKind, each vocabulary-only with observedAt/effectiveAt", () => {
    const snapshot = buildSnapshot();
    const observedAt = asTick(snapshot.simTime);
    const effectiveAt = asTick(snapshot.simTime + 1);
    const target = "AC1";

    const commands: Command[] = [
      assignHeading(target, asMillideg(180_000), observedAt, effectiveAt),
      assignAltitude(target, asMm(4_000_000), observedAt, effectiveAt),
      assignSpeed(target, asMmPerSec(140_000), observedAt, effectiveAt),
      hold(target, observedAt, effectiveAt),
      assignRunway(target, "09L", observedAt, effectiveAt),
      clearApproach(target, observedAt, effectiveAt),
      clearLand(target, observedAt, effectiveAt),
      goAround(target, observedAt, effectiveAt),
      divert(target, observedAt, effectiveAt),
    ];

    expect(commands).toHaveLength(COMMAND_KINDS.length);
    expect(new Set(commands.map((c) => c.kind))).toEqual(new Set(COMMAND_KINDS));

    for (const command of commands) {
      expect(command.target).toBe(target);
      expect(command.observedAt).toBe(observedAt);
      expect(command.effectiveAt).toBe(effectiveAt);
      // No coordinate/motion-override channel exists on any command: params
      // only ever carries the kind-specific vocabulary fields (FR-004).
      expect(command.params).not.toHaveProperty("x");
      expect(command.params).not.toHaveProperty("y");
      expect(command.params).not.toHaveProperty("z");
      expect(command.params).not.toHaveProperty("position");
      expect(command.params).not.toHaveProperty("coordinates");
    }
  });
});

// Constructing vocabulary-only commands is not enough: a command arriving as
// data must not be able to smuggle a field past the boundary. Dropping an
// unknown field would turn malformed controller output into an apparently
// valid command while hiding unsupported intent (spec.md Edge Cases, FR-004).
describe("unknown command fields are rejected, not dropped (FR-004, FR-011)", () => {
  const wellFormed = {
    kind: "hold",
    target: "AC1",
    params: {},
    observedAt: 0,
    effectiveAt: 1,
  } as const;

  it("accepts the well-formed baseline", () => {
    expect(parseCommand(wellFormed).ok).toBe(true);
  });

  it.each([
    ["position", { x: 1, y: 2, z: 3 }],
    ["coordinates", [1, 2, 3]],
    ["velocity", 100],
    ["priority", "high"],
  ])("rejects a command carrying an unknown %s field", (field, value) => {
    const result = parseCommand({ ...wellFormed, [field]: value });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.reason).toBe("unknown-field");
  });

  it("rejects an unknown field inside params rather than silently dropping it", () => {
    const result = parseCommand({
      ...wellFormed,
      kind: "assignHeading",
      params: { heading: 90_000, altitude: 4_000_000 },
    });
    expect(result.ok).toBe(false);
  });

  it("still rejects params missing the field its kind requires", () => {
    const result = parseCommand({ ...wellFormed, kind: "assignHeading", params: {} });
    expect(result.ok).toBe(false);
  });
});
