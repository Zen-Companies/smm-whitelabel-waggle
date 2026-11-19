// Setup first, then free (approved 20 Nov, canvas "Setup first, then free"). Pure: no I/O.
//
// A brand whose setup hasn't been "passed" (finished, skipped once, Finish later once, or an
// account connected) sends its owner from every app page to setup, at the first step not done.
// Once passed, never again, and nothing shows. Team members invited to someone else's brand and
// Waggle staff are never sent there; nor are setup itself, plan and account pages, sign-in,
// invites, connect returns, staff pages and anything public.

export type SetupGateDecision = "open" | { redirect: string };

export interface SetupGateInput {
  /** The brand has been through setup (setup_passed_at, or a connected account). */
  passed: boolean;
  /** The user's role in the brand's organization (only "owner" is ever sent to setup). */
  role: string | null;
  /** Waggle staff. */
  staff: boolean;
  /** The page asked for: pathname, with or without its query. */
  path: string;
}

/**
 * Where the gate sends the owner: it remembers the page, then opens setup at the first step not
 * done, with a welcome back.
 */
export const SETUP_RESUME_PATH = "/setup/resume";

/** The page they were going to, kept while they finish setup (value: `<tenantId>:<path>`). */
export const SETUP_NEXT_COOKIE = "waggle_setup_next";
export const SETUP_NEXT_MAX_AGE = 60 * 60 * 24;

/** Pages never sent to setup (the page itself, or anything under it). */
const OPEN_PAGES = [
  "/setup",
  "/welcome",
  "/start",
  "/reveal",
  "/plan",
  "/settings/account",
  "/settings/billing",
  "/orgs",
  "/brands",
  "/more",
  "/admin",
  "/api",
  "/connect",
  "/invite",
  "/beta",
  "/auth",
  "/login",
  "/signup",
  "/forgot",
  "/reset",
  "/requests",
  "/oauth",
  "/add-photos",
  "/.well-known",
] as const;

const BASE = "https://waggle.invalid";
const MAX_LENGTH = 500;

const pathnameOf = (path: string) => path.split(/[?#]/, 1)[0] || "/";

/** Pure: whether this page is never sent to setup. "/" is the public landing page. */
export function isOpenPage(path: string): boolean {
  const p = pathnameOf(path);
  if (p === "/") return true;
  return OPEN_PAGES.some((open) => p === open || p.startsWith(`${open}/`));
}

/**
 * Pure: a same-site page to open after setup (pathname and query, no hash), or null. Mirrors the
 * connect return check (accounts/connect-return.ts): only relative paths starting with one "/",
 * no "//", no backslashes, no control characters. Pages that never need setup (setup itself,
 * sign-in…) aren't worth remembering, so they give null too.
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw || raw.length > MAX_LENGTH) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  if (isOpenPage(url.pathname)) return null;
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

/** Pure: the gate's decision for one page load. */
export function setupGate(i: SetupGateInput): SetupGateDecision {
  if (i.passed || i.staff || i.role !== "owner" || isOpenPage(i.path)) return "open";
  const next = safeNextPath(i.path);
  const q = next ? `?${new URLSearchParams({ next }).toString()}` : "";
  return { redirect: `${SETUP_RESUME_PATH}${q}` };
}

/** Pure: the cookie value that remembers `next` for this brand. */
export const nextCookieValue = (tenantId: string, next: string) => `${tenantId}:${next}`;

/** Pure: the remembered page for this brand from the cookie, or null. */
export function nextFromCookie(value: string | undefined, tenantId: string): string | null {
  if (!value) return null;
  const at = value.indexOf(":");
  if (at < 0 || value.slice(0, at) !== tenantId) return null;
  return safeNextPath(value.slice(at + 1));
}

/** Pure: where the resume lands: the first step not done (6, the end, when all are). */
export function resumeHref(step: number): string {
  return `/setup?step=${step}&resume=1`;
}

/**
 * Pure: "Welcome back. Pick up where you left off: N of 5 done." shows only when the owner came
 * through the gate (resume=1), on a step (not the end), with at least one step done.
 */
export function showWelcomeBack(i: { resume: unknown; step: number; done: number }): boolean {
  return i.resume === "1" && i.step >= 1 && i.step <= 5 && i.done > 0;
}

/** Pure: a pass request's `how` from a form, or null. */
export function passHowOf(raw: unknown): "skipped" | "finish_later" | null {
  return raw === "skipped" || raw === "finish_later" ? raw : null;
}

/**
 * Pure: where Skip for now / Finish later go when no page is remembered: a setup step or Today,
 * else setup's start (skip) or Today (Finish later).
 */
export function passTarget(raw: unknown, how: "skipped" | "finish_later"): string {
  if (typeof raw === "string" && /^\/(setup(\?step=[1-6])?|today)$/.test(raw)) return raw;
  return how === "finish_later" ? "/today" : "/setup";
}
