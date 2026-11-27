// Fix 1: record every connect (24 Nov). Pure: no I/O. The store (connect-trace-store.ts) keeps
// one connect_attempts row per sign-in started and closes it from what these decide.
//
// Zernio's return URL (docs.zernio.com/guides/connecting-accounts, "If it fails" and "Request
// ids"): on success `connected`, `profileId`, `accountId`, `username`; on failure `error`,
// `platform`, and when known `error_message`, `error_reason`, `is_user_fixable`,
// `platform_error`; always `request_id` and `stage`; headless pickers add `step` and
// `connect_token`. Our own `connecting` names the platform the return is for.

import { z } from "zod";
import { inAppName, isInAppBrowser } from "@/features/auth";

/** Attempts with no return after this long are marked abandoned by the sweep. */
export const CONNECT_ABANDON_AFTER_MS = 2 * 60 * 60 * 1000;
/** The CRM hears about a failed connect at most once per brand + platform in this window. */
export const CONNECT_FAILED_CRM_GAP_MS = 6 * 60 * 60 * 1000;
/** Zernio's / Meta's message, kept as sent but no longer than this. */
export const CONNECT_MESSAGE_MAX = 300;
export const USER_AGENT_MAX = 400;

export type ConnectOutcomeKind = "connected" | "failed" | "returned_without_account" | "abandoned";

export type UserAgentClass =
  | "in_app_instagram"
  | "in_app_facebook"
  | "in_app_tiktok"
  | "mobile_browser"
  | "desktop_browser"
  | "other";

/** Pure: which kind of browser the owner was in (the in-app ones are where Meta sign-in breaks). */
export function classifyUserAgent(ua: string | null | undefined): UserAgentClass {
  if (!ua) return "other";
  if (isInAppBrowser(ua)) {
    const app = inAppName(ua);
    if (app === "Instagram") return "in_app_instagram";
    if (app === "Facebook" || app === "Messenger") return "in_app_facebook";
    if (app === "TikTok") return "in_app_tiktok";
    return "other";
  }
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return "mobile_browser";
  if (/Windows NT|Macintosh|X11|CrOS|Linux x86_64/i.test(ua)) return "desktop_browser";
  return "other";
}

export const isInAppClass = (c: UserAgentClass | string | null | undefined) =>
  typeof c === "string" && c.startsWith("in_app_");

/** Pure: the raw user agent as stored (trimmed, at most 400 characters), or null. */
export function storedUserAgent(ua: string | null | undefined): string | null {
  const v = ua?.trim();
  return v ? v.slice(0, USER_AGENT_MAX) : null;
}

/** One query value: the first if repeated, trimmed, empty as missing, capped. */
const param = (max: number) =>
  z.preprocess((v) => {
    const one = Array.isArray(v) ? v[0] : v;
    if (typeof one !== "string") return undefined;
    const t = one.trim();
    return t ? t.slice(0, max) : undefined;
  }, z.string().optional());

/** A platform or connection id: lower-case letters and digits only. */
const platformParam = z.preprocess((v) => {
  const one = Array.isArray(v) ? v[0] : v;
  return typeof one === "string" && /^[a-z0-9_]{1,40}$/.test(one) ? one : undefined;
}, z.string().optional());

const fixableParam = z.preprocess((v) => {
  const one = Array.isArray(v) ? v[0] : v;
  if (one === "true" || one === "1") return true;
  if (one === "false" || one === "0") return false;
  return undefined;
}, z.boolean().optional());

const returnSchema = z.object({
  connecting: platformParam,
  connected: platformParam,
  platform: platformParam,
  error: param(100),
  error_message: param(CONNECT_MESSAGE_MAX),
  error_reason: param(100),
  is_user_fixable: fixableParam,
  platform_error: param(100),
  stage: param(40),
  step: param(40),
  request_id: param(100),
  accountId: param(100),
  profileId: param(100),
  connect_token: param(200),
});

export interface ConnectReturn {
  platform: string;
  error: string | null;
  errorMessage: string | null;
  errorReason: string | null;
  isUserFixable: boolean | null;
  platformError: string | null;
  stage: string | null;
  step: string | null;
  requestId: string | null;
  accountId: string | null;
  profileId: string | null;
  connectToken: string | null;
  /** Zernio said it connected (`connected` or an `accountId`). */
  saysConnected: boolean;
}

type Params = Record<string, string | string[] | undefined>;

/**
 * Pure: the connect return in these query params, or null when the page wasn't reached from a
 * connect. Off /connect/done (`always` false) a return needs our `connecting`, Zernio's
 * `connected`, or an `error` with a `platform`; our own `connect_error` (stopped before the
 * sign-in started) is not a return.
 */
export function parseConnectReturn(params: Params, always = false): ConnectReturn | null {
  const p = returnSchema.parse(params);
  const platform = p.connecting ?? p.connected ?? p.platform;
  if (!platform) return null;
  const isReturn = always || !!p.connecting || !!p.connected || (!!p.error && !!p.platform);
  if (!isReturn) return null;
  return {
    platform,
    error: p.error ?? null,
    errorMessage: p.error_message ?? null,
    errorReason: p.error_reason ?? null,
    isUserFixable: p.is_user_fixable ?? null,
    platformError: p.platform_error ?? null,
    stage: p.stage ?? null,
    step: p.step ?? null,
    requestId: p.request_id ?? null,
    accountId: p.accountId ?? null,
    profileId: p.profileId ?? null,
    connectToken: p.connect_token ?? null,
    saysConnected: !!p.connected || !!p.accountId,
  };
}

/** Zernio's "an earlier request already finished the connection": not a failure. */
const NOT_A_FAILURE = new Set(["code_already_redeemed"]);

/**
 * Pure: how the return closes the attempt. An error → failed; Zernio saying it connected, or
 * the account already here → connected; neither → returned_without_account.
 */
export function returnOutcome(
  ret: Pick<ConnectReturn, "error" | "saysConnected">,
  hasAccount: boolean,
): Exclude<ConnectOutcomeKind, "abandoned"> {
  if (ret.error && !NOT_A_FAILURE.has(ret.error)) return "failed";
  if (ret.saysConnected || hasAccount || ret.error) return "connected";
  return "returned_without_account";
}

/** The audit action for an outcome worth a look (connected is audited by account_connected). */
export function auditActionFor(outcome: ConnectOutcomeKind): string | null {
  switch (outcome) {
    case "failed":
      return "account_connect_failed";
    case "returned_without_account":
      return "account_connect_returned_without_account";
    case "abandoned":
      return "account_connect_abandoned";
    default:
      return null;
  }
}

/** The fields of an attempt the CRM event and audit row are built from. */
export interface AttemptFacts {
  platform: string;
  outcome: ConnectOutcomeKind;
  error: string | null;
  isUserFixable: boolean | null;
  userAgentClass: string | null;
}

/** Pure: the `connect_failed` details (become the waggle_connect_* fields, see features/crm). */
export function connectFailedDetails(a: AttemptFacts): Record<string, string> {
  const error =
    a.outcome === "abandoned"
      ? "abandoned"
      : a.outcome === "returned_without_account"
        ? "no_account"
        : (a.error ?? "unknown");
  return {
    platform: a.platform,
    connect_platform: a.platform,
    connect_error: error,
    connect_fixable: a.isUserFixable === null ? "unknown" : a.isUserFixable ? "yes" : "no",
    connect_in_app: isInAppClass(a.userAgentClass) ? "yes" : "no",
  };
}

/**
 * Pure: whether the CRM may hear about this failed connect: never twice for the same brand +
 * platform within 6 hours (`lastQueuedAt`: the last connect_failed queued for them).
 */
export function mayQueueConnectFailed(lastQueuedAt: Date | string | null, now: Date): boolean {
  if (!lastQueuedAt) return true;
  const last = typeof lastQueuedAt === "string" ? new Date(lastQueuedAt) : lastQueuedAt;
  if (Number.isNaN(last.getTime())) return true;
  return now.getTime() - last.getTime() >= CONNECT_FAILED_CRM_GAP_MS;
}

/** Pure: an open attempt started before this moment is abandoned. */
export function abandonedBefore(now: Date): Date {
  return new Date(now.getTime() - CONNECT_ABANDON_AFTER_MS);
}
