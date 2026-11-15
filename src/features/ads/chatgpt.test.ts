import { describe, expect, it } from "vitest";
import { linkHost, parseChatGptAd, toChatGptAdBody } from "./chatgpt";

const form = (v: Record<string, string>) => {
  const f = new FormData();
  for (const [k, val] of Object.entries(v)) f.set(k, val);
  return f;
};
const base = {
  title: "Open house this Saturday",
  body: "3 bed near the beach, 412 Harbor Dr. Tour it 1 to 3 PM.",
  linkUrl: "https://coastalhometeam.com/open-house",
  country: "US",
  daily: "20",
};

describe("ChatGPT ads (T79c)", () => {
  it("reads a good ad and builds the request", () => {
    const r = parseChatGptAd(form(base));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(
      toChatGptAdBody(r.value, {
        connectionId: "c1",
        adAccountId: "acct_1",
        imageUrl: "https://m/x.png",
      }),
    ).toEqual({
      accountId: "c1",
      adAccountId: "acct_1",
      name: "Open house this Saturday",
      goal: "traffic",
      budgetAmount: 20,
      budgetType: "daily",
      headline: "Open house this Saturday",
      body: "3 bed near the beach, 412 Harbor Dr. Tour it 1 to 3 PM.",
      imageUrl: "https://m/x.png",
      linkUrl: "https://coastalhometeam.com/open-house",
      countries: ["US"],
    });
  });

  it("keeps to ChatGPT's limits", () => {
    expect(parseChatGptAd(form({ ...base, title: "Hi" }))).toMatchObject({ field: "title" });
    expect(parseChatGptAd(form({ ...base, title: "x".repeat(51) }))).toMatchObject({
      field: "title",
    });
    expect(parseChatGptAd(form({ ...base, body: "x".repeat(101) }))).toMatchObject({
      field: "body",
    });
    expect(parseChatGptAd(form({ ...base, linkUrl: "http://x.com" }))).toMatchObject({
      field: "linkUrl",
    });
    expect(parseChatGptAd(form({ ...base, country: "PH" }))).toMatchObject({ field: "country" });
    expect(parseChatGptAd(form({ ...base, daily: "0" }))).toMatchObject({ field: "daily" });
    expect(parseChatGptAd(form({ ...base, daily: "2.5" }))).toMatchObject({ field: "daily" });
  });

  it("shows the site in the preview", () => {
    expect(linkHost("https://www.coastalhometeam.com/x")).toBe("coastalhometeam.com");
    expect(linkHost("nope")).toBe("");
  });
});
