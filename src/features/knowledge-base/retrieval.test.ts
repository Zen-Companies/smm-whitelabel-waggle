import { describe, expect, it, vi } from "vitest";
import type { LlmClient } from "@/lib/llm/client";
import type { ServiceClient } from "@/lib/supabase/service";
import { minSimilarity, retrieveKbEntries, RETRIEVAL_MIN_SIMILARITY } from "./retrieval";

const matches = [
  { id: "1", title: "Opening hours", content: "8am to 4pm", similarity: 0.51 },
  { id: "2", title: "Location and parking", content: "12 Harbour St", similarity: 0.13 },
  { id: "3", title: "Catering", content: "48 hours notice", similarity: 0.09 },
];

function deps() {
  const llm = { embed: vi.fn(async () => ({ embedding: Array(1536).fill(0.01), model: "m" })) };
  const db = { rpc: vi.fn(async () => ({ data: matches, error: null })) };
  return { llm: llm as unknown as LlmClient, db: db as unknown as ServiceClient };
}

describe("relevance floor (T31)", () => {
  it("drops topics below the floor", async () => {
    const found = await retrieveKbEntries(deps(), { tenantId: "t", query: "Open Saturday?" });
    expect(found.map((f) => f.title)).toEqual(["Opening hours"]);
  });

  it("can return nothing, so the draft says the info doesn't cover it", async () => {
    const found = await retrieveKbEntries(deps(), {
      tenantId: "t",
      query: "Is your kitchen halal?",
      minSimilarity: 0.6,
    });
    expect(found).toEqual([]);
  });

  it("KB_MIN_SIMILARITY overrides the default when it's a number from 0 to 1", () => {
    expect(minSimilarity({})).toBe(RETRIEVAL_MIN_SIMILARITY);
    expect(minSimilarity({ KB_MIN_SIMILARITY: "0.4" })).toBe(0.4);
    expect(minSimilarity({ KB_MIN_SIMILARITY: "0" })).toBe(0);
    expect(minSimilarity({ KB_MIN_SIMILARITY: "2" })).toBe(RETRIEVAL_MIN_SIMILARITY);
    expect(minSimilarity({ KB_MIN_SIMILARITY: "abc" })).toBe(RETRIEVAL_MIN_SIMILARITY);
  });
});
