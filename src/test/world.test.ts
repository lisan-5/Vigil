import { afterEach, describe, expect, it, vi } from "vitest";
import { MockWorld } from "@/api/mock/world";

describe("MockWorld autopilot", () => {
  afterEach(() => vi.useRealTimers());

  it("starts an organic incident within a minute and lets it end on its own", () => {
    vi.useFakeTimers();
    const world = new MockWorld();
    world.ensureRunning();
    expect(world.activeIncidents()).toHaveLength(0);

    vi.advanceTimersByTime(65_000);
    const [incident] = world.activeIncidents();
    expect(incident).toBeDefined();
    expect(incident.endsAt - incident.startedAt).toBeGreaterThanOrEqual(70_000);

    vi.advanceTimersByTime(125_000);
    expect(world.activeIncidents()).toHaveLength(0);
  });
});
