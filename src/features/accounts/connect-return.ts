// Where a connect comes back to (20 Nov). Pure: no I/O.
//
// A connect returns to the page it started from, success or failure, and the page says what
// happened in place. The brand's first connected account always goes to setup step 2 instead,
// so the owner sees "Reading your inbox…" and the reveal. The origin travels with the request
// (a form field or an argument) and is checked here: only our own pages, never another site.

/** Where a connect comes back to when the origin is missing or not allowed. */
export const DEFAULT_RETURN = "/settings/accounts";

/** Pages a connect may start from (and so come back to). */
const RETURN_PAGES = [
  "/settings/accounts",
  "/settings",
  "/setup",
  "/welcome",
  "/today",
  "/inbox",
  "/posts",
  "/contacts",
  "/insights",
  "/teach",
] as const;

/** Params a connect adds; an origin never carries old ones forward. */
const CONNECT_PARAMS = [
  "connect_error",
  "error",
  "error_message",
  "platform",
  "connecting",
  "connected",
  "before",
  "back",
];

const BASE = "https://waggle.invalid";
const MAX_LENGTH = 500;

/**
 * Pure: a same-site path from the allowlist (pathname and query, no hash), with any earlier
 * connect params removed, or null. Rejects absolute and protocol-relative addresses,
 * backslashes and control characters.
 */
export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw || raw.length > MAX_LENGTH) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  // Browsers read a backslash as a slash ("/\evil.com"); control characters hide tricks.
  if (raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  const path = url.pathname;
  if (!RETURN_PAGES.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  for (const key of CONNECT_PARAMS) url.searchParams.delete(key);
  const query = url.searchParams.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Pure: the origin a form sent (`back`). "setup" is the older way setup asked to come back to
 * its Connect step. Anything not allowed falls back to Settings → Connected accounts.
 */
export function connectOrigin(raw: unknown): string {
  if (raw === "setup") return "/welcome";
  return safeReturnPath(raw) ?? DEFAULT_RETURN;
}

/** Pure: `path` with these params set (others kept). Empty values are left out. */
export function withParams(path: string, params: Record<string, string | null | undefined>) {
  const url = new URL(path, BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}

/** Pure: setup's step 2, watching this platform connect (the first account's landing). */
export function firstConnectHref(platform: string): string {
  return withParams("/setup", { connecting: platform });
}

/**
 * Pure: where the sign-in sends the browser back to. The brand's first connected account lands
 * on setup step 2 wherever it started; later ones go back to where they started.
 */
export function connectReturnHref(input: {
  origin: string;
  platform: string;
  firstAccount: boolean;
}): string {
  if (input.firstAccount) return firstConnectHref(input.platform);
  return withParams(input.origin, { connecting: input.platform });
}

/** Pure: back to the origin with what stopped the connect, for its page to say in place. */
export function connectErrorHref(origin: string, code: string, platform?: string | null): string {
  return withParams(origin, { connect_error: code, platform });
}
