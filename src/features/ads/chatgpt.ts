// ChatGPT ads (T79c, board "Ads · ChatGPT", approved 15 Nov): a chat card ad written in Waggle.
// docs.zernio.com/platforms/openai-ads: title 3 to 50, body up to 100, a still image and a link,
// targeting by country only (served in the US, Canada, Australia and New Zealand), a daily
// budget of at least 1 with automatic bidding ("Maximize Results" needs a daily budget; awareness
// and lifetime budgets need a fixed bid, so Waggle offers visits on a daily budget). Pure; tested.

export const CHATGPT_TITLE_MIN = 3;
export const CHATGPT_TITLE_MAX = 50;
export const CHATGPT_BODY_MAX = 100;
export const CHATGPT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHATGPT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const CHATGPT_COUNTRIES = [
  ["US", "United States"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["NZ", "New Zealand"],
] as const;

export type ChatGptAd = {
  title: string;
  body: string;
  linkUrl: string;
  country: string;
  daily: number;
};

type Parsed = { ok: true; value: ChatGptAd } | { ok: false; field: string; error: string };

/** Pure: the New ad form (the photo is checked where it's uploaded). */
export function parseChatGptAd(f: FormData): Parsed {
  const title = String(f.get("title") ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (title.length < CHATGPT_TITLE_MIN || title.length > CHATGPT_TITLE_MAX) {
    return {
      ok: false,
      field: "title",
      error: `The title needs ${CHATGPT_TITLE_MIN} to ${CHATGPT_TITLE_MAX} characters.`,
    };
  }
  const body = String(f.get("body") ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!body || body.length > CHATGPT_BODY_MAX) {
    return {
      ok: false,
      field: "body",
      error: `Write one line, up to ${CHATGPT_BODY_MAX} characters.`,
    };
  }
  const linkUrl = String(f.get("linkUrl") ?? "").trim();
  let ok = false;
  try {
    const u = new URL(linkUrl);
    ok = u.protocol === "https:" && u.hostname.includes(".");
  } catch {
    ok = false;
  }
  if (!ok) {
    return {
      ok: false,
      field: "linkUrl",
      error: "Add the page to send people to (starts with https://).",
    };
  }
  const country = String(f.get("country") ?? "");
  if (!CHATGPT_COUNTRIES.some(([c]) => c === country)) {
    return { ok: false, field: "country", error: "Pick where it shows." };
  }
  const daily = Number(String(f.get("daily") ?? "").trim());
  if (!(Number.isInteger(daily) && daily >= 1 && daily <= 100_000)) {
    return {
      ok: false,
      field: "daily",
      error: "The daily budget has to be at least 1, in whole amounts.",
    };
  }
  return { ok: true, value: { title, body, linkUrl, country, daily } };
}

/** The create request (`POST /v1/ads/create`): visits, a daily budget, automatic bidding. */
export function toChatGptAdBody(
  v: ChatGptAd,
  ctx: { connectionId: string; adAccountId: string; imageUrl: string },
): Record<string, unknown> {
  return {
    accountId: ctx.connectionId,
    adAccountId: ctx.adAccountId,
    name: v.title.slice(0, 100),
    goal: "traffic",
    budgetAmount: v.daily,
    budgetType: "daily",
    headline: v.title,
    body: v.body,
    imageUrl: ctx.imageUrl,
    linkUrl: v.linkUrl,
    countries: [v.country],
  };
}

/** "coastalhometeam.com" for the preview's Sponsored line. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
