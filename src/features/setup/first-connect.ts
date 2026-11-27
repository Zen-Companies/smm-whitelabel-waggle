// First connect in setup (canvas board approved 20 Nov): step 2's edge cases and step 3's
// questions from the customers' own messages. Pure, tested.

import { breakerApp, type BreakerApp } from "@/features/auth";
import { BUSINESS_KINDS, QUESTION_MAX } from "./starter";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Pure: the page is open inside a browser that breaks the connect (Instagram's, Facebook's,
 * Messenger's, or TikTok's since 27 Nov), where the ads land. Returns which one, or null.
 */
export function isInAppBrowser(ua: string | null | undefined): BreakerApp | null {
  return breakerApp(ua);
}

export type ConnectProblem =
  /** Any failed Instagram connect: worded as the likely cause, a personal account (board). */
  | { kind: "instagram-personal" }
  /** The owner closed or declined the platform's sign-in (23 Nov): Try again. */
  | { kind: "cancelled"; platform: string }
  /** Free's accounts are all in use (23 Nov): the Solo card in place, not the plan page. */
  | { kind: "free-full" }
  /** Anything else that came back with an error: said in the connect banner's words. */
  | { kind: "message"; text: string };

/**
 * The sign-in was declined or closed: Zernio's `oauth_denied`, with the platform's own
 * `access_denied` / `user_denied` when sent (docs.zernio.com/guides/connecting-accounts, "If it
 * fails"). On Instagram a bare `oauth_denied` stays the personal-account fix, its likely cause.
 */
const DENIED = new Set(["access_denied", "user_denied"]);

/**
 * Pure: what went wrong when the connect flow sent the owner back to step 2. The flow appends
 * `error` (+ `error_message`) and `platform` on failure (see accounts/connect-banner.ts); ours are
 * `connect_error`. `bannerText` is the accounts feature's wording for the same params.
 */
export function connectProblem(params: Params, bannerText: string | null): ConnectProblem | null {
  const error = first(params.error);
  const ours = first(params.connect_error);
  if (!error && !ours) return null;
  // Not a failure: an earlier request already finished the connection.
  if (error === "code_already_redeemed") return null;
  if (ours === "free_full") return { kind: "free-full" };
  const platform = first(params.platform) ?? first(params.connecting);
  if (error === "oauth_denied" && platform) {
    const theirs = first(params.platform_error);
    if (platform !== "instagram" || (theirs && DENIED.has(theirs))) {
      return { kind: "cancelled", platform };
    }
  }
  if (error && platform === "instagram") return { kind: "instagram-personal" };
  return bannerText ? { kind: "message", text: bannerText } : null;
}

/** "Common for cafés": the business type the generic questions are for. */
const COMMON_FOR: Record<string, string> = {
  food: "cafés",
  beauty: "salons",
  shop: "shops",
  realestate: "real estate",
  fitness: "gyms",
  services: "local services",
};

/** Pure: "Common for cafés", "Common for dog grooming", or "Common questions". */
export function commonForLabel(kindKey: string | null, custom: string): string {
  if (kindKey === "other" && custom.trim()) return `Common for ${custom.trim().toLowerCase()}`;
  const what = kindKey ? COMMON_FOR[kindKey] : undefined;
  return what ? `Common for ${what}` : "Common questions";
}

export interface SeedItem {
  item: string;
  count: number;
}

/** One question step 3 starts with. */
export interface QuestionSeed {
  question: string;
  /** "14 people asked" when it came from their own customers. */
  asked: number | null;
  /** What an ambiguous question was about: one answer field each. */
  items: SeedItem[];
  /** Asked with no clear item ("not sure which"). */
  unsure: number;
  /** The chip: "14 people asked", "Common for cafés", "Suggested". */
  tag: string;
}

interface TopLike {
  question: string;
  count: number;
  items: SeedItem[];
  unsure: number;
}

/** Pure: "14 people asked" / "1 person asked". */
export function askedLabel(n: number): string {
  return n === 1 ? "1 person asked" : `${n} people asked`;
}

/**
 * Pure: step 3's questions. The customers' own come first, most asked first; fewer than 3 are
 * filled from the business type's usual ones (marked "Common for …"), skipping repeats.
 */
export function questionSeeds(
  top: TopLike[],
  fallback: readonly string[],
  commonFor: string,
  min = 3,
): QuestionSeed[] {
  const seen = new Set<string>();
  const out: QuestionSeed[] = [];
  for (const t of [...top].sort((a, b) => b.count - a.count)) {
    const question = t.question.replace(/\s+/g, " ").trim().slice(0, QUESTION_MAX);
    const key = question.toLowerCase();
    if (!question || seen.has(key)) continue;
    seen.add(key);
    const items = t.items.filter((i) => i.item.trim() && i.count > 0);
    out.push({
      question,
      asked: t.count,
      items,
      unsure: Math.max(0, t.unsure),
      tag: askedLabel(t.count),
    });
  }
  for (const q of fallback) {
    if (out.length >= min) break;
    if (seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    out.push({ question: q, asked: null, items: [], unsure: 0, tag: commonFor });
  }
  return out;
}

/** Pure: "About: Winter menu box (6) · Oat latte (5) · not sure which (2)". */
export function aboutLine(items: SeedItem[], unsure: number): string {
  const parts = items.map((i) => `${i.item} (${i.count})`);
  if (unsure > 0) parts.push(`not sure which (${unsure})`);
  return parts.length ? `About: ${parts.join(" · ")}` : "";
}

/**
 * Pure: one answer per item, saved as one answer to the question (a price list):
 * "Winter menu box: $28, serves 2\nOat latte: $5.20". Items left blank are left out, so Waggle
 * never answers for them (no answer for an item → no draft, it goes to the owner).
 */
export function combineItemAnswers(rows: { item: string; answer: string }[]): string {
  return rows
    .map((r) => ({ item: r.item.trim(), answer: r.answer.replace(/\s+/g, " ").trim() }))
    .filter((r) => r.item && r.answer)
    .map((r) => `${r.item}: ${r.answer}`)
    .join("\n");
}

/** The business type's usual questions (step 1's kind; Something else when not picked). */
export function kindQuestions(kindKey: string | null): readonly string[] {
  return (
    BUSINESS_KINDS.find((k) => k.key === kindKey) ?? BUSINESS_KINDS[BUSINESS_KINDS.length - 1]
  ).questions;
}
