import * as Sentry from "@sentry/nextjs";
import { describe, expect, it, vi } from "vitest";
import type { ServiceClient } from "@/lib/supabase/service";
import {
  createDbUsageRecorder,
  openRouterCostUsd,
  withUsageSource,
  type AiUsageRecord,
} from "./usage";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const usage: AiUsageRecord = {
  tenantId: "tenant-1",
  itemId: "item-1",
  purpose: "draft",
  provider: "openrouter",
  model: "openai/gpt-5",
  inputTokens: 500,
  outputTokens: 80,
  costUsd: 0.0021,
};

function fakeDb(error: { message: string } | null = null) {
  const insert = vi.fn(async () => ({ error }));
  return { db: { from: vi.fn(() => ({ insert })) } as unknown as ServiceClient, insert };
}

describe("createDbUsageRecorder", () => {
  it("inserts an ai_usage row", async () => {
    const { db, insert } = fakeDb();
    await createDbUsageRecorder(db).record(usage);
    expect(insert).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      item_id: "item-1",
      purpose: "draft",
      provider: "openrouter",
      model: "openai/gpt-5",
      input_tokens: 500,
      output_tokens: 80,
      cost_usd: 0.0021,
      source: "live",
    });
  });

  it("tags lab and practice calls with their source", async () => {
    const { db, insert } = fakeDb();
    await withUsageSource(createDbUsageRecorder(db), "practice").record(usage);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ source: "practice" }));
  });

  it("reports a failed insert to Sentry by ids instead of failing the AI step", async () => {
    const { db } = fakeDb({ message: "timeout" });
    await expect(createDbUsageRecorder(db).record(usage)).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      extra: { tenantId: "tenant-1", itemId: "item-1", purpose: "draft" },
    });
  });
});

describe("openRouterCostUsd", () => {
  it("reads providerMetadata.openrouter.usage.cost", () => {
    expect(openRouterCostUsd({ openrouter: { usage: { cost: 0.0004, totalTokens: 10 } } })).toBe(
      0.0004,
    );
  });

  it.each([undefined, {}, { openrouter: {} }, { openrouter: { usage: { cost: -1 } } }])(
    "returns 0 for %j",
    (metadata) => {
      expect(openRouterCostUsd(metadata)).toBe(0);
    },
  );
});
