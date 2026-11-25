import type { ProviderLog } from "@/lib/social";
import { platformName } from "./derive";

// Staff → Customers, connect tries (board "Connect tries: what happened, step by step", approved
// 26 Nov): one timeline per try joining Waggle's connect_attempts row with Zernio's activity log,
// read live when staff open the page. Pure, tested. Codes, ids and Zernio's or the platform's
// own error text only: never anything the customer typed (CLAUDE.md rule 10).

/** A try with no return is marked abandoned after this long (accounts' sweep, 2 hours). */
export const IN_PROGRESS_MS = 2 * 60 * 60 * 1000;
/** Zernio's log is read from a minute before the tap... */
export const LOG_LEAD_MS = 60 * 1000;
/** ...to at most 3 hours after it. */
export const LOG_SPAN_MS = 3 * 60 * 60 * 1000;
/** The sign-in link is made right after the tap; a request further out isn't this try's. */
const LINK_SPAN_MS = 2 * 60 * 1000;

export interface TraceAttempt {
  platform: string;
  startedAt: string;
  returnedAt: string | null;
  outcome: string | null;
  outcomeAt: string | null;
  userAgentClass: string | null;
  userAgent: string | null;
  zernioRequestId: string | null;
}

/** The window of Zernio's log one try is read over. */
export function logWindow(startedAt: string, now: Date): { from: string; to: string } {
  const start = Date.parse(startedAt);
  return {
    from: new Date(start - LOG_LEAD_MS).toISOString(),
    to: new Date(Math.min(start + LOG_SPAN_MS, now.getTime())).toISOString(),
  };
}

export type StepState = "done" | "failed" | "waiting" | "todo" | "unknown";

export interface TraceStep {
  key: "tapped" | "link" | "signin" | "back" | "connected";
  at: string | null;
  title: string;
  by: "Waggle" | "Zernio";
  state: StepState;
  /** Plain words after the title (status, handle). */
  detail: string | null;
  /** Zernio's or the platform's own message, shown word for word. */
  quote: string | null;
  /** Zernio's request id, to copy. */
  requestId: string | null;
  /** What staff can tell the customer, when known. */
  hint: string | null;
}

export interface Deduction {
  headline: string;
  reason: string | null;
  basis: string;
}

export interface ConnectStory {
  steps: TraceStep[];
  /** Only when Zernio has no sign-in answer and the try didn't connect. */
  likely: Deduction | null;
}

const minutesBetween = (a: number, b: number) => Math.max(0, Math.floor((b - a) / 60000));

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  400: "Bad request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not found",
  409: "Conflict",
  422: "Unprocessable",
  429: "Too many requests",
  500: "Server error",
  502: "Bad gateway",
  503: "Unavailable",
};

const pathOnly = (p: string) => p.split("?")[0]!.replace(/\/+$/, "");

/** Zernio's `GET /v1/connect/<platform>` for this try: its request id, else the nearest one. */
export function findLinkRequest(a: TraceAttempt, logs: readonly ProviderLog[]): ProviderLog | null {
  const start = Date.parse(a.startedAt);
  const candidates = logs.filter((l) => {
    if (l.type !== "api_request") return false;
    const path = l.path ? pathOnly(l.path) : "";
    const isConnect =
      path.endsWith(`/connect/${a.platform}`) ||
      (l.operationId === "getConnectUrl" && (!path || path.endsWith(`/${a.platform}`)));
    if (!isConnect) return false;
    const t = Date.parse(l.createdAt);
    return t >= start - LOG_LEAD_MS && t <= start + LINK_SPAN_MS;
  });
  if (a.zernioRequestId) {
    const same = candidates.find((l) => l.requestId === a.zernioRequestId);
    if (same) return same;
  }
  return (
    candidates.sort(
      (x, y) =>
        Math.abs(Date.parse(x.createdAt) - start) - Math.abs(Date.parse(y.createdAt) - start),
    )[0] ?? null
  );
}

const isConnectEntry = (l: ProviderLog) =>
  l.type === "connections" &&
  (l.status === "success" ||
    l.status === "failed" ||
    l.action === "account.connected" ||
    l.eventType === "connect_success" ||
    l.eventType === "connect_failed");

const isSuccess = (l: ProviderLog) =>
  l.action === "account.connected" ||
  l.eventType === "connect_success" ||
  (l.status === "success" && l.action !== "account.disconnected");

/**
 * Zernio's sign-in answer for this try: the first connections entry for the platform after the
 * tap and before `until` (the next try on the same platform, so a later try's answer isn't
 * borrowed).
 */
export function findSignIn(
  a: TraceAttempt,
  logs: readonly ProviderLog[],
  until: string | null,
): ProviderLog | null {
  const start = Date.parse(a.startedAt) - LOG_LEAD_MS;
  const end = until ? Date.parse(until) : start + LOG_LEAD_MS + LOG_SPAN_MS;
  return (
    logs
      .filter((l) => {
        if (!isConnectEntry(l)) return false;
        if (l.platform && l.platform !== a.platform) return false;
        const t = Date.parse(l.createdAt);
        return t >= start && t < end;
      })
      .sort((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt))[0] ?? null
  );
}

/** Zernio's message when it names a fix the customer can make. */
export function fixHint(message: string | null, platform: string): string | null {
  if (!message) return null;
  if (/no (facebook )?pages?/i.test(message))
    return "Can they fix it? Yes: they need a Facebook Page.";
  if (/not (a )?(business|professional|creator)/i.test(message))
    return `Can they fix it? Yes: switch ${platformName(platform)} to a professional account.`;
  if (/(denied|cancel+ed|declined)/i.test(message))
    return "Can they fix it? Yes: try again and allow every step.";
  return null;
}

const isIphone = (ua: string | null) => !!ua && /iPhone|iPad|iPod/i.test(ua);
const META = new Set(["facebook", "instagram"]);
const IN_APP: Record<string, string> = {
  in_app_instagram: "Instagram",
  in_app_facebook: "Facebook",
  in_app_tiktok: "TikTok",
};

/** "Most likely", deduced by Waggle from time since the link, the browser and the platform. */
export function deduce(a: TraceAttempt, linkAt: string | null, now: Date): Deduction {
  const name = platformName(a.platform);
  const since = Date.parse(linkAt ?? a.startedAt);
  const mins = minutesBetween(since, now.getTime());
  const open = a.outcome === null && now.getTime() - Date.parse(a.startedAt) < IN_PROGRESS_MS;
  const headline = open
    ? `In progress · ${mins} min, probably still on ${name}'s screens.`
    : a.outcome === "returned_without_account"
      ? `Came back from ${name}'s sign-in without an account.`
      : `Didn't finish ${name}'s sign-in.`;

  const inApp = a.userAgentClass ? IN_APP[a.userAgentClass] : undefined;
  let reason: string | null = null;
  if (inApp) {
    reason = `Opened inside ${inApp}'s browser, which often breaks sign-in. Ask them to open Waggle in Safari or Chrome.`;
  } else if (isIphone(a.userAgent) && META.has(a.platform)) {
    reason = `On iPhone, ${name} may open its own app and not return to the browser.`;
  } else if (a.userAgentClass === "desktop_browser" && META.has(a.platform)) {
    reason =
      "On a computer the usual reasons: no Facebook Page (a personal profile can't finish), the Page wasn't ticked on Facebook's \"what Waggle can access\" step, or the window was closed.";
  }
  return {
    headline,
    reason,
    basis: `Deduced by Waggle: no answer from ${name} after the link.${
      open ? ' Marked "Abandoned" at 2 hours if nothing comes back.' : ""
    }`,
  };
}

/**
 * The "What happened" steps for one try. `logs` is null when Zernio's log couldn't be read:
 * then only Waggle's own steps show.
 */
export function buildStory(input: {
  attempt: TraceAttempt;
  logs: readonly ProviderLog[] | null;
  /** The next try on the same platform, if any. */
  nextStartedAt: string | null;
  now: Date;
}): ConnectStory {
  const { attempt: a, logs, now } = input;
  const name = platformName(a.platform);
  const blank = { quote: null, requestId: null, hint: null, detail: null };
  const steps: TraceStep[] = [
    {
      ...blank,
      key: "tapped",
      at: a.startedAt,
      title: `Tapped ${name}`,
      by: "Waggle",
      state: "done",
    },
  ];

  let signIn: ProviderLog | null = null;
  let link: ProviderLog | null = null;
  if (logs) {
    link = findLinkRequest(a, logs);
    if (!link) {
      steps.push({
        ...blank,
        key: "link",
        at: null,
        title: "Sign-in link made",
        by: "Zernio",
        state: "unknown",
        detail: "not in Zernio's log",
        requestId: a.zernioRequestId,
      });
    } else {
      const code = link.statusCode;
      const ok = code !== null ? code < 400 : link.status !== "failed";
      steps.push({
        ...blank,
        key: "link",
        at: link.createdAt,
        title: ok ? "Sign-in link made" : "Sign-in link",
        by: "Zernio",
        state: ok ? "done" : "failed",
        detail: ok
          ? code !== null
            ? `${code} ${STATUS_TEXT[code] ?? ""}`.trim()
            : null
          : `failed · Zernio ${code ?? ""}`.trim(),
        quote: ok ? null : link.errorMessage,
        requestId: link.requestId,
        hint: ok ? null : "Waggle's side: send this request id to Zernio.",
      });
    }

    signIn = findSignIn(a, logs, input.nextStartedAt);
    if (!signIn) {
      steps.push({
        ...blank,
        key: "signin",
        at: null,
        title: `${name} sign-in`,
        by: "Zernio",
        state: "waiting",
        detail: `no answer from ${name} yet (Zernio has no callback)`,
      });
    } else if (isSuccess(signIn)) {
      steps.push({
        ...blank,
        key: "signin",
        at: signIn.createdAt,
        title: `${name} sign-in`,
        by: "Zernio",
        state: "done",
        detail: [
          "connected",
          signIn.successUsername ? `@${signIn.successUsername.replace(/^@/, "")}` : null,
          signIn.successAccountType ? `${signIn.successAccountType} account` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    } else {
      steps.push({
        ...blank,
        key: "signin",
        at: signIn.createdAt,
        title: `${name} sign-in`,
        by: "Zernio",
        state: "failed",
        detail: signIn.errorCode ? `failed · ${signIn.errorCode}` : "failed",
        quote: signIn.errorMessage,
        hint: fixHint(signIn.errorMessage, a.platform),
      });
    }
  }

  steps.push({
    ...blank,
    key: "back",
    at: a.returnedAt,
    title: "Back in Waggle",
    by: "Waggle",
    state: a.returnedAt ? "done" : "todo",
  });
  const connected = a.outcome === "connected";
  steps.push({
    ...blank,
    key: "connected",
    at: connected ? (a.outcomeAt ?? a.returnedAt) : null,
    title: "Account connected",
    by: "Waggle",
    state: connected ? "done" : a.outcome && a.outcome !== "abandoned" ? "failed" : "todo",
  });

  const likely = logs && !signIn && !connected ? deduce(a, link?.createdAt ?? null, now) : null;
  return { steps, likely };
}

/** "In progress · N min" for a try with no outcome under 2 hours old, else null. */
export function tryInProgress(
  a: { outcome: string | null; startedAt: string },
  now: Date,
): string | null {
  if (a.outcome !== null) return null;
  const age = now.getTime() - Date.parse(a.startedAt);
  return age >= 0 && age < IN_PROGRESS_MS ? `In progress · ${Math.floor(age / 60000)} min` : null;
}

/**
 * The list's and the page's status. Stuck at Connect with a try still open under 2 hours reads
 * "In progress · N min" instead (board, 26 Nov).
 */
export function connectStatusLabel(input: {
  stage: string;
  stageLabel: string;
  /** The newest try's outcome and start, when there is one. */
  lastTry: { outcome: string | null; startedAt: string } | null;
  now: Date;
}): { label: string; inProgress: boolean } {
  if (input.stage === "active") return { label: "Active", inProgress: false };
  const open =
    input.stage === "connect" && input.lastTry ? tryInProgress(input.lastTry, input.now) : null;
  return open
    ? { label: open, inProgress: true }
    : { label: `Stuck at ${input.stageLabel}`, inProgress: false };
}
