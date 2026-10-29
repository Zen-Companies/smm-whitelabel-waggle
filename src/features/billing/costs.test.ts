import { describe, expect, it } from "vitest";
import { combineCosts } from "./costs";

const row = (over: Partial<Parameters<typeof combineCosts>[0][number]> = {}) => ({
  tenant_id: "t1",
  tenant_name: "Harbour Bean",
  zernio_profile_id: "prof_a" as string | null,
  messages: 10,
  replies_sent: 6,
  ai_calls: 25,
  ai_cost_usd: 0.05,
  ...over,
});

describe("combineCosts", () => {
  it("adds Zernio's spend per profile and AI cost per message", () => {
    const [t] = combineCosts([row()], {
      periodStart: null,
      periodEnd: null,
      totalUsd: 12,
      unattributedUsd: 2,
      byProfile: [{ profileId: "prof_a", totalUsd: 10 }],
    });
    expect(t).toMatchObject({ zernioCostUsd: 10, aiCostUsd: 0.05, messages: 10 });
    expect(t.aiCostPerMessageUsd).toBeCloseTo(0.005);
  });

  it("no usage (mock) or no profile: Zernio cost unknown; no messages: no per-message cost", () => {
    expect(combineCosts([row()], null)[0].zernioCostUsd).toBeNull();
    const usage = {
      periodStart: null,
      periodEnd: null,
      totalUsd: 0,
      unattributedUsd: 0,
      byProfile: [],
    };
    expect(combineCosts([row({ zernio_profile_id: null })], usage)[0].zernioCostUsd).toBeNull();
    expect(combineCosts([row()], usage)[0].zernioCostUsd).toBe(0);
    expect(combineCosts([row({ messages: 0 })], null)[0].aiCostPerMessageUsd).toBeNull();
  });
});
