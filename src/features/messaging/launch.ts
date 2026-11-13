import type { RcsAgentView } from "@/lib/social/types";

// RCS launch details (T83b): what the agent sends and how people agree to it, filed for the
// carriers' review. US: once the agent is in testing and works on the owner's phones; elsewhere
// right after the request (docs.zernio.com/platforms/rcs/connect, step 5).

export const INTERACTIONS = {
  TRANSACTIONAL_UPDATES: "Order and booking updates",
  CUSTOMER_SUPPORT: "Answering questions",
  TWO_WAY_CONVERSATION: "Two-way chats",
  MARKETING_OR_PROMOTIONAL: "Offers",
  LOYALTY_OR_REWARD: "Loyalty and rewards",
  ACCOUNT_ALERTS: "Account alerts",
} as const;

export const OPT_IN_METHODS = {
  SMS: "They text you first",
  WEBSITE: "A box on your website",
  SALE_POINT: "In person, at the counter",
  QR_CODE: "A QR code",
  MOBILE_APP: "In your app",
} as const;

/** Methods carriers need a screenshot of. */
const NEEDS_SCREENSHOT = ["WEBSITE", "MOBILE_APP"];

/** Where the launch form shows: US in testing; elsewhere until the details are filed. */
export function launchDue(agent: RcsAgentView): boolean {
  if (agent.country === "US") return agent.status === "testing";
  return (
    !agent.launchSent &&
    (agent.status === "requested" ||
      agent.status === "changes_requested" ||
      agent.status === "brand_vetting")
  );
}

export function launchDefaults(businessName: string): Record<string, string> {
  return {
    optInMessage: `You're subscribed to ${businessName} messages. Reply STOP to opt out, HELP for help.`,
    helpResponse: `${businessName}: reply to this message and we'll help. Reply STOP to opt out.`,
    optOutResponse: `You're unsubscribed from ${businessName}. Reply START to subscribe again.`,
  };
}

type Bad = { ok: false; field: string; error: string };
const val = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const https = (raw: string) => /^https:\/\/[^\s/]+\.[^\s]+$/.test(raw);

/**
 * Validates the launch form. The opt-in screenshot is uploaded by the action and passed in as
 * `screenshotUrl` (null when none was given).
 */
export function parseLaunch(
  f: FormData,
  o: { us: boolean; screenshotUrl: string | null },
): { ok: true; body: Record<string, unknown>; needsScreenshot: boolean } | Bad {
  const companyOverview = val(f, "companyOverview");
  if (companyOverview.length < 30)
    return {
      ok: false,
      field: "companyOverview",
      error: "Say what the business does, in a sentence or two.",
    };
  const agentOverview = val(f, "agentOverview");
  if (agentOverview.length < 30)
    return {
      ok: false,
      field: "agentOverview",
      error: "Say what you'll send and to whom, in a sentence or two.",
    };
  const interactions = f
    .getAll("interactions")
    .map(String)
    .filter((k) => k in INTERACTIONS);
  if (!interactions.length)
    return { ok: false, field: "interactions", error: "Tick at least one kind of message." };
  const examples = [1, 2, 3].map((i) => val(f, `example${i}`));
  const bad = examples.findIndex((e) => e.length < 10);
  if (bad >= 0)
    return { ok: false, field: `example${bad + 1}`, error: "Write a real example message." };
  if (new Set(examples).size < 3)
    return { ok: false, field: "example3", error: "Write three different examples." };

  const methods = f
    .getAll("optIn")
    .map(String)
    .filter((k) => k in OPT_IN_METHODS);
  if (!methods.length)
    return { ok: false, field: "optIn", error: "Tick how people agree to your messages." };
  const callToAction = val(f, "callToAction");
  if (callToAction.length < 10)
    return {
      ok: false,
      field: "callToAction",
      error: "Write the words people agree to, like “Tick to get order updates by message.”",
    };
  const consent: Record<string, unknown> = {
    optInMethods: methods.map((type) => ({ type })),
    callToAction,
  };
  if (methods.includes("WEBSITE")) {
    const url = val(f, "callToActionUrl");
    if (!https(url))
      return {
        ok: false,
        field: "callToActionUrl",
        error: "Add the page with the box, starting with https://.",
      };
    consent.callToActionUrl = url;
  }
  const needsScreenshot = methods.some((m) => NEEDS_SCREENSHOT.includes(m));
  if (needsScreenshot) {
    if (!o.screenshotUrl)
      return { ok: false, field: "screenshot", error: "Add a screenshot of where people agree." };
    consent.callToActionMediaUrl = o.screenshotUrl;
  }
  const doubleOptIn = f.get("doubleOptIn") === "yes";
  consent.doubleOptIn = doubleOptIn;
  if (doubleOptIn) {
    const m = val(f, "doubleOptInMessage");
    if (m.length < 10)
      return {
        ok: false,
        field: "doubleOptInMessage",
        error: "Write the message that asks them to confirm.",
      };
    consent.doubleOptInMessage = m;
  }
  for (const [k, label] of [
    ["optInMessage", "the welcome message"],
    ["helpResponse", "the HELP reply"],
    ["optOutResponse", "the STOP reply"],
  ] as const) {
    const m = val(f, k);
    if (m.length < 10) return { ok: false, field: k, error: `Write ${label}.` };
    consent[k] = m.slice(0, 500);
  }
  if (!/\bSTOP\b/.test(String(consent.optInMessage)))
    return { ok: false, field: "optInMessage", error: "Say they can reply STOP to opt out." };

  const body: Record<string, unknown> = {
    companyOverview: companyOverview.slice(0, 1000),
    agentOverview: agentOverview.slice(0, 1000),
    interactions: interactions.map((type) => ({ type })),
    messageExamples: examples.map((e) => e.slice(0, 1000)),
    consent,
  };
  const video = val(f, "testVideoUrl");
  if (o.us && !https(video)) {
    return {
      ok: false,
      field: "testVideoUrl",
      error: "Add the link to your test video, starting with https://.",
    };
  }
  if (video) {
    if (!https(video))
      return { ok: false, field: "testVideoUrl", error: "The video link starts with https://." };
    body.testVideoUrl = video;
  }
  const extra = val(f, "additionalInformation");
  if (extra) body.additionalInformation = extra.slice(0, 1000);
  return { ok: true, body, needsScreenshot };
}

/** A US test phone: E.164. */
export function parseTestPhone(raw: string): string | null {
  const digits = raw.trim().replace(/[\s().-]/g, "");
  return /^\+\d{8,15}$/.test(digits) ? digits : null;
}
