import { describe, expect, it, vi } from "vitest";
import type { AiUsageRecord, UsageRecorder } from "@/lib/llm/usage";
import { JevClassifier, loadJevConfig } from "./jev";
import { JEV_QUESTIONS } from "./jev-questions";
import { ClassifierError, type ClassifyInput } from "./types";

const URL_ = "https://jev.test/v1/systemone";
const input: ClassifyInput = {
  tenantId: "tenant-1",
  itemId: "item-1",
  text: "What time do you open on Sunday?",
  kind: "comment",
  businessContext: "Demo Coffee Shop",
};

function jevBody(noul: Record<string, number>, usage = { input_tokens: 120, output_tokens: 4 }) {
  return {
    model: "jevos-v5",
    answers: Object.fromEntries(
      Object.entries(noul).map(([k, v]) => [k, { type: "noul", noul: v }]),
    ),
    usage,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function setup(
  fetchImpl: typeof fetch,
  config: Partial<{ apiKey: string; costPerMTokInput: number }> = {},
) {
  const records: AiUsageRecord[] = [];
  const usage: UsageRecorder = { record: async (r) => void records.push(r) };
  const fetchMock = vi.fn(fetchImpl);
  const jev = new JevClassifier(
    { url: URL_, model: "jev-latest", costPerMTokInput: 0.042, apiKey: "jv_test", ...config },
    { usage, fetch: fetchMock },
  );
  return { jev, records, fetchMock };
}

const scores = { complaint: 0.05, lead: 0.1, faq: 0.97, spam: 0.02 };

describe("JevClassifier", () => {
  it("sends the §9.1 request and picks the category", async () => {
    const { jev, fetchMock } = setup(async () => json(jevBody(scores)));

    const result = await jev.classify(input);

    expect(result).toEqual({
      category: "faq",
      confidence: expect.closeTo(0.97 * 0.95 * 0.9),
      provider: "jev",
      model: "jevos-v5",
      scores,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL_);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer jv_test");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "jev-latest",
      state: { business: "Demo Coffee Shop", channel: "comment", customer_message: input.text },
      questions: {
        complaint: { type: "noul", instructions: JEV_QUESTIONS.complaint },
        lead: { type: "noul", instructions: JEV_QUESTIONS.lead },
        faq: { type: "noul", instructions: JEV_QUESTIONS.faq },
        spam: { type: "noul", instructions: JEV_QUESTIONS.spam },
      },
    });
  });

  it("omits Authorization without a key (local jevos)", async () => {
    const { jev, fetchMock } = setup(async () => json(jevBody(scores)), { apiKey: "" });
    await jev.classify(input);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has("Authorization")).toBe(false);
  });

  it("records ai_usage with input-token cost", async () => {
    const { jev, records } = setup(async () =>
      json(jevBody(scores, { input_tokens: 1_000_000, output_tokens: 4 })),
    );
    await jev.classify(input);
    expect(records).toEqual([
      {
        tenantId: "tenant-1",
        itemId: "item-1",
        purpose: "classify",
        provider: "jev",
        model: "jevos-v5",
        inputTokens: 1_000_000,
        outputTokens: 4,
        costUsd: 0.042,
      },
    ]);
  });

  it.each([
    ["a missing key", { model: "m", answers: { complaint: { type: "noul", noul: 0.1 } } }],
    ["a noul above 1", jevBody({ ...scores, faq: 1.2 })],
    [
      "a wrong answer type",
      {
        ...jevBody(scores),
        answers: { ...jevBody(scores).answers, faq: { type: "choice", noul: 0.5 } },
      },
    ],
  ])("rejects %s as invalid_output", async (_name, body) => {
    const { jev } = setup(async () => json(body));
    await expect(jev.classify(input)).rejects.toMatchObject({ kind: "invalid_output" });
  });

  it("still records usage when the answers are invalid", async () => {
    const { jev, records } = setup(async () => json(jevBody({ ...scores, faq: 2 })));
    await expect(jev.classify(input)).rejects.toBeInstanceOf(ClassifierError);
    expect(records).toHaveLength(1);
  });

  it("rejects a non-JSON body as invalid_output", async () => {
    const { jev } = setup(async () => new Response("<html>oops</html>", { status: 200 }));
    await expect(jev.classify(input)).rejects.toMatchObject({ kind: "invalid_output" });
  });

  it.each([400, 401, 402, 422, 429, 500, 529])("maps HTTP %i to an http error", async (status) => {
    const { jev, records } = setup(async () => json({ error: "nope" }, status));
    await expect(jev.classify(input)).rejects.toMatchObject({ kind: "http", status });
    expect(records).toHaveLength(0);
  });

  it("maps a network failure to a network error", async () => {
    const { jev } = setup(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(jev.classify(input)).rejects.toMatchObject({ kind: "network" });
  });

  it("maps an aborted request to a timeout", async () => {
    const { jev } = setup(
      (_url, init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        ),
    );
    const controller = new AbortController();
    const pending = jev.classify(input, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: "timeout" });
  });
});

describe("loadJevConfig", () => {
  it("applies defaults and treats empty values as unset", () => {
    expect(
      loadJevConfig({
        JEV_API_URL: "http://127.0.0.1:8017/v1/systemone",
        JEV_API_KEY: "",
        JEV_TIMEOUT_MS: "",
      }),
    ).toEqual({
      url: "http://127.0.0.1:8017/v1/systemone",
      apiKey: undefined,
      model: "jev-latest",
      timeoutMs: 3000,
      costPerMTokInput: 0,
    });
  });

  it("requires JEV_API_URL and names it without values", () => {
    expect(() => loadJevConfig({ JEV_API_KEY: "secret" })).toThrow(/JEV_API_URL/);
    expect(() => loadJevConfig({ JEV_API_KEY: "secret" })).not.toThrow(/secret/);
  });
});
