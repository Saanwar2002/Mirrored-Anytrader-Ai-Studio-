import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchLiveDemandZones, SurgeZone } from "../../src/services/surgeHeatmapService";

describe("Live Demand Zones & Heatmap Surge Service", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("successfully fetches server-aggregated live demand zones", async () => {
    const mockZones: SurgeZone[] = [
      {
        lat: 53.65,
        lng: -1.78,
        radius: 800,
        intensity: "high",
        label: "£3.50 Surge",
        surgeMultiplier: 1.6,
        maxWaitTimeMins: 22,
        waitWarning: true,
        extraFee: 3.5,
        isFixedModel: true,
        uiColor: "red",
        uiOpacity: 40,
      },
      {
        lat: 53.68,
        lng: -1.82,
        radius: 600,
        intensity: "medium",
        label: "£2.00 Surge",
        surgeMultiplier: 1.3,
        maxWaitTimeMins: 12,
        waitWarning: false,
        extraFee: 2.0,
        isFixedModel: true,
        uiColor: "amber",
        uiOpacity: 40,
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, zones: mockZones }),
    } as any);

    const zones = await fetchLiveDemandZones();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(zones).toHaveLength(2);
    expect(zones[0].intensity).toBe("high");
    expect(zones[0].surgeMultiplier).toBe(1.6);
    expect(zones[1].intensity).toBe("medium");
  });

  it("handles empty or disabled surge zones cleanly without throwing", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, zones: [] }),
    } as any);

    const zones = await fetchLiveDemandZones();
    expect(zones).toEqual([]);
  });

  it("fails closed gracefully on network error or HTTP 500 without leaking permissions errors", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server error" }),
    } as any);

    const zones = await fetchLiveDemandZones();
    expect(zones).toEqual([]);
  });

  it("fails closed gracefully on network exception without throwing to the caller", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network failed"));

    const zones = await fetchLiveDemandZones();
    expect(zones).toEqual([]);
  });
});
