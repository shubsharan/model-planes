// T020: the throughput budget of `advanceTick` (spec SC-005; research R9).
//
// SC-005: "a benchmark author can advance a 50-aircraft world through one hour
// of simulated time in under one minute of real time on commodity hardware."
// One tick is `MS_PER_TICK` (100 ms) of simulated time, so one simulated hour is
// 3_600_000 / 100 = 36_000 ticks. This suite runs exactly that: 50 aircraft,
// 36_000 ticks, no commands.
//
// The assertion budget is 10 s, not the 60 s of the spec. R9 sets it there on
// purpose: a test that only failed at 60 s would leave no room to notice a
// regression before it broke the stated guarantee, and a machine slower than the
// one this was written on still has 6x headroom before the spec bound is at
// risk. A failure here is therefore an early warning, not yet an SC-005 breach —
// but the measured number is printed in the failure message so the reader can
// tell which of the two they are looking at.
//
// On clock reads: `Date.now()` and `performance.now()` are forbidden inside
// `packages/sim/src` — the engine is a pure function of (state, commands) and a
// clock read there would make a replay non-reproducible. The read below is in
// the *test harness*, wrapping the loop from the outside. Nothing measured here
// flows into engine state, so the determinism guarantee is untouched.
import { describe, expect, it } from "vitest";
import { MS_PER_TICK, type AircraftState, parseWorldSnapshot } from "@model-planes/core";
import { createWorldEngineState } from "../src/world-engine-state.ts";
import { advanceTick } from "../src/world-engine.ts";
import { aircraft, snapshot } from "./fixtures.ts";

// --- Run shape ---------------------------------------------------------------

/** One simulated hour, in ticks: 3_600_000 ms / 100 ms per tick. */
const TICKS = 3_600_000 / MS_PER_TICK;

/** Fleet size named by SC-005. */
const FLEET_SIZE = 50;

/** R9's test budget, in wall-clock ms. Deliberately 6x under the spec's 60 s. */
const BUDGET_MS = 10_000;

/**
 * Cruise speed for the run, in mm/s — the fixture's `minSpeed`, chosen for
 * geometry rather than realism. At 50_000 mm/s a tick advances
 * `round(50_000 * 100 / 1000) = 5_000` mm, so 36_000 ticks cover 180_000_000 mm
 * against an airspace 200_000_000 mm wide. That is what lets an aircraft started
 * on the upwind side fly the whole hour without ever reaching the boundary.
 */
const CRUISE_MM_PER_SEC = 50_000;

/**
 * Start offset from the origin along each axis, in mm. Combined with the 90_000
 * mm/axis of per-aircraft spread below, every start point stays inside the
 * ±100_000_000 mm bound, and so does every point reached during the run.
 */
const START_OFFSET_MM = 90_000_000;

/** Per-aircraft position stagger, in mm, so no two aircraft share a point. */
const STAGGER_MM = 100_000;

/** Eight compass headings in millidegrees, cycled across the fleet. */
const HEADINGS = [0, 45_000, 90_000, 135_000, 180_000, 225_000, 270_000, 315_000] as const;

/** `-1`, `0`, or `+1` — the direction a component of motion carries an axis. */
function axisSign(component: number): number {
  if (component > 1e-9) return 1;
  if (component < -1e-9) return -1;
  return 0;
}

/**
 * A fleet of `count` aircraft on assorted headings, each placed *upwind* of its
 * own track so a full hour of dead reckoning stays inside the airspace.
 *
 * Built with `aircraft()` in a loop rather than `manyAircraft()`: that helper
 * applies one `overrides` object to every aircraft, so it cannot give them
 * differing headings, and a fleet all pointed at heading 0 would pile into the
 * +x boundary and freeze — turning most of the run into a no-op instead of the
 * work SC-005 is about.
 */
function fleet(count: number): readonly AircraftState[] {
  const built: AircraftState[] = [];
  for (let i = 0; i < count; i++) {
    const heading = HEADINGS[i % HEADINGS.length] ?? 0;
    const radians = (heading / 1000) * (Math.PI / 180);
    // Start at -sign * 90_000_000 on each axis: travel along that axis is at
    // most 180_000_000 mm, so the far end lands at +90_000_000 mm at worst.
    built.push(
      aircraft({
        id: `AC-${i + 1}`,
        heading,
        speed: CRUISE_MM_PER_SEC,
        position: {
          x: -axisSign(Math.cos(radians)) * START_OFFSET_MM + i * STAGGER_MM,
          y: -axisSign(Math.sin(radians)) * START_OFFSET_MM + i * STAGGER_MM,
          z: 1_000_000,
        },
        // The fixture default is exactly 36_000, one unit per tick, so every
        // aircraft's window reaches zero on the final tick of the run. That is
        // expected and harmless: exhaustion is a reported event, not a freeze,
        // and it costs the same work as any other tick.
      }),
    );
  }
  return built;
}

// --- Throughput (SC-005) -----------------------------------------------------

describe("advanceTick sustains a 50-aircraft world for an hour of simulated time", () => {
  it("advances 36_000 ticks within the benchmark budget", () => {
    const initial = createWorldEngineState(snapshot({ aircraft: fleet(FLEET_SIZE) }));
    if (!initial.ok) {
      throw new Error(
        `test invariant: fixture snapshot is contract-invalid: ${initial.error.message}`,
      );
    }
    const startTick = initial.value.snapshot.simTime;

    let state = initial.value;
    // The clock reads bracket the loop from outside the engine; see the file
    // header. Nothing between them consults a clock.
    const startedAt = performance.now();
    for (let i = 0; i < TICKS; i++) {
      const outcome = advanceTick(state, []);
      if (!outcome.ok) {
        throw new Error(`advanceTick errored on tick ${i}: ${outcome.error.message}`);
      }
      state = outcome.value.state;
    }
    const elapsedMs = performance.now() - startedAt;

    // Correctness first: a budget met by a loop that silently did nothing
    // would be worthless evidence for SC-005.
    expect(state.snapshot.simTime).toBe(startTick + TICKS);
    expect(state.snapshot.aircraft).toHaveLength(FLEET_SIZE);
    expect(parseWorldSnapshot(state.snapshot).ok).toBe(true);

    // The measured number rides along in the failure message so a future
    // reader sees the actual margin, not just "too slow".
    expect(
      elapsedMs,
      `${FLEET_SIZE} aircraft x ${TICKS} ticks took ${elapsedMs.toFixed(0)} ms ` +
        `(R9 budget ${BUDGET_MS} ms, SC-005 bound 60000 ms)`,
    ).toBeLessThan(BUDGET_MS);
  }, // Generous per-test timeout: on a slow machine this should report a budget
  // assertion failure carrying the measured time, not an opaque test timeout.
  60_000);
});
