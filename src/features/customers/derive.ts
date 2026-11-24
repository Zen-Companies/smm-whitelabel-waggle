import { z } from "zod";
import { parseUtmCookie, type Utm } from "@/lib/crm";

// Staff → Customers (board "Staff → Customers: trace every business", approved 24 Nov): where a
// business stopped, its flags, where it came from, and one timeline. Pure, tested. Counts, codes
// and labels only: never a customer's message text (CLAUDE.md rule 10).

// ── Where they are ──────────────────────────────────────────────────────────────────────────────

export const STAGES = ["connect", "step2", "step3", "checkout", "active"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  connect: "Connect",
  step2: "Step 2",
  step3: "Step 3",
  checkout: "Checkout",
  active: "Active",
};

/** Setup's step 3 screens (features/setup flow.ts STEP_OF; old screens open as "chat"). */
const STEP3_SCREENS: ReadonlySet<string> = new Set(["money", "quick", "waiting", "how", "chat"]);

/** Stripe statuses that mean the organization pays (or is in a card-backed trial). */
const PAYING: ReadonlySet<string> = new Set(["active", "trialing", "past_due"]);

export interface StageFacts {
  /** An Instagram/Facebook/... account came through Connect (released ones don't count). */
  connected: boolean;
  /** Setup finished or passed (tenants.setup_done_at / setup_passed_at). */
  setupDone: boolean;
  /** tenants.setup_screen: the screen the owner left setup on. */
  setupScreen: string | null;
  /** Latest billing.checkout_started / billing.checkout_returned in the audit log. */
  checkoutStartedAt: string | null;
  checkoutReturnedAt: string | null;
  /** org_billing.status (Stripe's subscription status), null without a bill. */
  billingStatus: string | null;
}

export const isPaying = (status: string | null): boolean => status !== null && PAYING.has(status);

/** A checkout was opened and nothing came of it (no return after it, no paying bill). */
export function leftCheckout(f: StageFacts): boolean {
  if (!f.checkoutStartedAt || isPaying(f.billingStatus)) return false;
  return !f.checkoutReturnedAt || f.checkoutReturnedAt < f.checkoutStartedAt;
}

/** The first place the business stopped: Connect → Step 2 → Step 3 → Checkout → Active. */
export function stuckAt(f: StageFacts): Stage {
  if (!f.connected) return "connect";
  if (!f.setupDone) return f.setupScreen && STEP3_SCREENS.has(f.setupScreen) ? "step3" : "step2";
  if (leftCheckout(f)) return "checkout";
  return "active";
}

// ── Connect tries ───────────────────────────────────────────────────────────────────────────────

export const OUTCOMES = ["connected", "failed", "returned_without_account", "abandoned"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  connected: "Connected",
  failed: "Failed",
  returned_without_account: "Came back, no account",
  abandoned: "Abandoned",
};

export const isOutcome = (v: unknown): v is Outcome =>
  typeof v === "string" && (OUTCOMES as readonly string[]).includes(v);

export interface AttemptLite {
  platform: string;
  outcome: string | null;
  startedAt: string;
  userAgentClass: string | null;
}

/** Tries that didn't connect (failed, came back with no account, never came back). */
export const failedTries = (attempts: readonly AttemptLite[]): number =>
  attempts.filter((a) => a.outcome !== null && a.outcome !== "connected").length;

export const latestAttempt = (attempts: readonly AttemptLite[]): AttemptLite | null =>
  attempts.reduce<AttemptLite | null>((m, a) => (!m || a.startedAt > m.startedAt ? a : m), null);

const PLATFORM_NAMES: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  googlebusiness: "Google",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  twitter: "X",
  youtube: "YouTube",
  threads: "Threads",
  pinterest: "Pinterest",
  whatsapp: "WhatsApp",
};

export const platformName = (p: string): string =>
  PLATFORM_NAMES[p] ?? p.charAt(0).toUpperCase() + p.slice(1);

// ── Browser ─────────────────────────────────────────────────────────────────────────────────────

/** connect_attempts.user_agent_class, the browser filter. */
export const BROWSERS = [
  "in_app_instagram",
  "in_app_facebook",
  "in_app_tiktok",
  "mobile_browser",
  "desktop_browser",
  "other",
] as const;
export type Browser = (typeof BROWSERS)[number];

export const BROWSER_LABEL: Record<Browser, string> = {
  in_app_instagram: "Instagram in-app",
  in_app_facebook: "Facebook in-app",
  in_app_tiktok: "TikTok in-app",
  mobile_browser: "Mobile browser",
  desktop_browser: "Desktop browser",
  other: "Other browser",
};

export const isBrowser = (v: unknown): v is Browser =>
  typeof v === "string" && (BROWSERS as readonly string[]).includes(v);

export const browserLabel = (v: string | null): string | null =>
  isBrowser(v) ? BROWSER_LABEL[v] : null;

export const isInApp = (v: string | null): boolean => v !== null && v.startsWith("in_app_");

// ── The line under "Where they are" ─────────────────────────────────────────────────────────────

/** Setup step 3's questions an owner answers (tenants.setup_chat keys; choices only). */
export const CHAT_QUESTIONS = ["kind", "facts", "replies", "needyou", "topics", "mode"] as const;

export function chatAnswered(setupChat: unknown): number {
  if (!setupChat || typeof setupChat !== "object" || Array.isArray(setupChat)) return 0;
  const saved = setupChat as Record<string, unknown>;
  return CHAT_QUESTIONS.filter((k) => saved[k] !== undefined && saved[k] !== null).length;
}

export function whereLine(input: {
  stage: Stage;
  attempts: readonly AttemptLite[];
  /** A catch-up (step 2's read of 30 days) still running. */
  reading: boolean;
  setupChat: unknown;
  checkoutPlan: string | null;
  planLabel: string;
}): string {
  switch (input.stage) {
    case "connect": {
      const last = latestAttempt(input.attempts);
      if (!last) return "No connect tries yet";
      const name = platformName(last.platform);
      if (last.outcome === "failed") return `Connect failed (${name})`;
      if (last.outcome === "returned_without_account") return "Came back without an account";
      if (last.outcome === "abandoned") return `Gave up at ${name} sign-in`;
      if (last.outcome === "connected") return `${name} connected, account arriving`;
      return `Signing in to ${name}`;
    }
    case "step2":
      return input.reading ? "Reading 30 days of messages" : "Seeing what they missed";
    case "step3":
      return `Answered ${chatAnswered(input.setupChat)} of ${CHAT_QUESTIONS.length} questions`;
    case "checkout":
      return input.checkoutPlan
        ? `Left Stripe checkout (${planName(input.checkoutPlan)})`
        : "Left Stripe checkout";
    case "active":
      return input.planLabel;
  }
}

// ── Flags ───────────────────────────────────────────────────────────────────────────────────────

export const IDLE_AFTER_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Flag {
  key: "connect_failed" | "checkout_abandoned" | "idle" | "offboarded" | "test";
  label: string;
  tone: "red" | "honey" | "grey";
}

export function flagsFor(input: {
  stage: Stage;
  failedTries: number;
  lastActivityAt: string | null;
  offboardedAt: string | null;
  isTest: boolean;
  now: Date;
}): Flag[] {
  const out: Flag[] = [];
  if (input.offboardedAt) out.push({ key: "offboarded", label: "Offboarded", tone: "grey" });
  // Once connected the flag clears; the failed tries stay in the attempts table.
  if (input.stage === "connect" && input.failedTries > 0) {
    out.push({ key: "connect_failed", label: `Connect failed ×${input.failedTries}`, tone: "red" });
  }
  if (input.stage === "checkout") {
    out.push({ key: "checkout_abandoned", label: "Checkout abandoned", tone: "honey" });
  }
  if (input.stage !== "active" && !input.offboardedAt && input.lastActivityAt) {
    const days = Math.floor((input.now.getTime() - Date.parse(input.lastActivityAt)) / DAY_MS);
    if (days >= IDLE_AFTER_DAYS) {
      out.push({ key: "idle", label: `No activity ${days} days`, tone: "grey" });
    }
  }
  if (input.isTest) out.push({ key: "test", label: "Test", tone: "grey" });
  return out;
}

/** The newest of the times given (ISO strings compare in order). */
export const latest = (...times: (string | null | undefined)[]): string | null =>
  times.reduce<string | null>((m, t) => (t && (!m || t > m) ? t : m), null);

// ── Source ──────────────────────────────────────────────────────────────────────────────────────

export const SOURCES = ["ad", "referral", "organic", "unknown"] as const;
export type SourceKind = (typeof SOURCES)[number];

export const SOURCE_LABEL: Record<SourceKind, string> = {
  ad: "Ad",
  referral: "Referral",
  organic: "Organic",
  unknown: "Unknown",
};

export interface Source {
  kind: SourceKind;
  /** "meta · nov-reels-food", "HARBOUR10", "no campaign link", or null. */
  label: string | null;
  utm: Utm;
}

const PAID_MEDIUM = /^(paid|cpc|ppc|cpm|ads?|paid[_-]?social|paidsocial|social[_-]?paid)$/i;
const AD_SOURCE = /^(meta|fb|facebook|ig|instagram|tiktok|google[_-]?ads|adwords)$/i;

/**
 * Where the sign-up came from, from the `signed_up` CRM event's first-touch UTMs (the proxy's
 * `waggle_utm` cookie, 18 Nov). No event (signed up before it existed, or older than 2 days at
 * the time): unknown. An event without UTMs: organic (no campaign link). Not guessed further.
 */
export function sourceOf(signedUp: { details: unknown } | null): Source {
  if (!signedUp) return { kind: "unknown", label: null, utm: {} };
  const raw =
    signedUp.details && typeof signedUp.details === "object" && !Array.isArray(signedUp.details)
      ? (signedUp.details as Record<string, unknown>).utm
      : undefined;
  const utm = parseUtmCookie(typeof raw === "string" ? raw : null);
  if (!utm) return { kind: "organic", label: "no campaign link", utm: {} };
  if (utm.ref_code) return { kind: "referral", label: utm.ref_code, utm };
  const campaign = [utm.utm_source, utm.utm_campaign].filter(Boolean).join(" · ") || null;
  if (
    (utm.utm_medium && PAID_MEDIUM.test(utm.utm_medium)) ||
    (utm.utm_source && AD_SOURCE.test(utm.utm_source))
  ) {
    return { kind: "ad", label: campaign, utm };
  }
  return { kind: "organic", label: campaign, utm };
}

// ── Plan ────────────────────────────────────────────────────────────────────────────────────────

export const PLAN_KINDS = ["free", "trial", "paid"] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

const PLAN_NAMES: Record<string, string> = { solo: "Solo", business: "Business", team: "Team" };
export const planName = (p: string | null): string =>
  p ? (PLAN_NAMES[p] ?? p.charAt(0).toUpperCase() + p.slice(1)) : "Free";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function planOf(
  bill: {
    plan: string | null;
    status: string | null;
    trialEndsAt: string | null;
    interval: string | null;
  } | null,
): { kind: PlanKind; label: string } {
  if (!bill || !bill.status || !isPaying(bill.status)) {
    const lapsed = bill?.status && bill.status !== "incomplete" ? ` (${bill.status})` : "";
    return { kind: "free", label: `Free${lapsed}` };
  }
  const name = planName(bill.plan);
  if (bill.status === "trialing") {
    return {
      kind: "trial",
      label: bill.trialEndsAt
        ? `${name} trial ends ${shortDate(bill.trialEndsAt)}`
        : `${name} trial`,
    };
  }
  const every = bill.interval === "year" ? "yearly" : bill.interval === "month" ? "monthly" : "";
  const late = bill.status === "past_due" ? " · past due" : "";
  return { kind: "paid", label: `${name} paid${every ? ` ${every}` : ""}${late}` };
}

// ── The list's filters ──────────────────────────────────────────────────────────────────────────

export const RANGES = ["7d", "30d", "90d", "all"] as const;
export type Range = (typeof RANGES)[number];
export const RANGE_LABEL: Record<Range, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "Any time",
};
const RANGE_DAYS: Record<Exclude<Range, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };

export const rangeStart = (r: Range, now: Date): Date | null =>
  r === "all" ? null : new Date(now.getTime() - RANGE_DAYS[r] * DAY_MS);

export const PAGE_SIZE = 25;

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const optionOf = <T extends string>(values: readonly T[]) =>
  z.preprocess(
    one,
    z
      .enum(values as unknown as [T, ...T[]])
      .optional()
      .catch(undefined),
  );

export const listParamsSchema = z.object({
  q: z.preprocess(one, z.string().max(200).optional().catch(undefined)),
  range: z.preprocess(one, z.enum(RANGES).catch("all").default("all")),
  source: optionOf(SOURCES),
  stuck: optionOf(STAGES),
  plan: optionOf(PLAN_KINDS),
  browser: optionOf(BROWSERS),
  shown: z.preprocess(
    one,
    z.coerce.number().int().min(PAGE_SIZE).max(1000).catch(PAGE_SIZE).default(PAGE_SIZE),
  ),
});
export type ListParams = z.infer<typeof listParamsSchema>;

export const parseListParams = (sp: Record<string, string | string[] | undefined>): ListParams =>
  listParamsSchema.parse(sp);

/** What a row needs for search and filters. */
export interface Filterable {
  name: string;
  ownerEmail: string | null;
  handles: readonly string[];
  source: SourceKind;
  stage: Stage;
  plan: PlanKind;
  browser: string | null;
}

/** Business name, owner email or an Instagram/Facebook handle ("@x" or "x"), any case. */
export function matchesSearch(row: Filterable, q: string | undefined): boolean {
  const term = (q ?? "").trim().toLowerCase();
  if (!term) return true;
  const bare = term.replace(/^@/, "");
  return (
    row.name.toLowerCase().includes(term) ||
    (row.ownerEmail ?? "").toLowerCase().includes(term) ||
    row.handles.some((h) => h.toLowerCase().replace(/^@/, "").includes(bare))
  );
}

/** Every filter but "stuck at" (the count tiles are counted over this). */
export const matchesBase = (row: Filterable, p: ListParams): boolean =>
  matchesSearch(row, p.q) &&
  (!p.source || row.source === p.source) &&
  (!p.plan || row.plan === p.plan) &&
  (!p.browser || row.browser === p.browser);

export const matchesAll = (row: Filterable, p: ListParams): boolean =>
  matchesBase(row, p) && (!p.stuck || row.stage === p.stuck);

/** The count tiles: everyone in the base filter, then per stage. */
export function stageCounts(
  rows: readonly Filterable[],
): { total: number } & Record<Stage, number> {
  const out = { total: rows.length, connect: 0, step2: 0, step3: 0, checkout: 0, active: 0 };
  for (const r of rows) out[r.stage] += 1;
  return out;
}

/** The list's URL with one value changed (undefined removes it); `shown` resets. */
export function listHref(
  p: ListParams,
  change: Partial<Record<keyof ListParams, string | undefined>>,
): string {
  const merged: Record<string, string | undefined> = {
    q: p.q,
    range: p.range === "all" ? undefined : p.range,
    source: p.source,
    stuck: p.stuck,
    plan: p.plan,
    browser: p.browser,
  };
  for (const [k, v] of Object.entries(change)) merged[k] = v;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `/admin/customers?${s}` : "/admin/customers";
}

// ── Timeline ────────────────────────────────────────────────────────────────────────────────────

export const TIMELINE_KINDS = ["audit", "connect", "crm", "email", "checkout", "staff"] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];
export const TIMELINE_LABEL: Record<TimelineKind, string> = {
  audit: "Audit",
  connect: "Connect",
  crm: "CRM (GoHighLevel)",
  email: "Email",
  checkout: "Checkout",
  staff: "Staff views",
};
export const isTimelineKind = (v: unknown): v is TimelineKind =>
  typeof v === "string" && (TIMELINE_KINDS as readonly string[]).includes(v);

export interface TimelineEvent {
  id: string;
  at: string;
  kind: TimelineKind;
  title: string;
  detail: string | null;
}

/** All sources in one list, newest first (ties keep their order). */
export function mergeTimeline(...lists: readonly (readonly TimelineEvent[])[]): TimelineEvent[] {
  return lists
    .flat()
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.at === b.e.at ? a.i - b.i : a.e.at < b.e.at ? 1 : -1))
    .map(({ e }) => e);
}

export function countKinds(events: readonly TimelineEvent[]): Record<TimelineKind, number> {
  const out = Object.fromEntries(TIMELINE_KINDS.map((k) => [k, 0])) as Record<TimelineKind, number>;
  for (const e of events) out[e.kind] += 1;
  return out;
}

/** The audit actions staff write here (one per look and per action). */
export const STAFF_AUDIT = {
  viewed: "staff.customer.viewed",
  copiedEmail: "staff.customer.copied_email",
  openedStripe: "staff.customer.opened_stripe",
  openedGhl: "staff.customer.opened_ghl",
  resentConfirm: "staff.customer.resent_confirm_email",
} as const;

const AUDIT_TITLES: Record<string, string> = {
  [STAFF_AUDIT.viewed]: "opened this page",
  [STAFF_AUDIT.copiedEmail]: "copied the owner's email",
  [STAFF_AUDIT.openedStripe]: "opened the Stripe customer",
  [STAFF_AUDIT.openedGhl]: "opened the GoHighLevel contact",
  [STAFF_AUDIT.resentConfirm]: "sent the confirm email again",
  "billing.checkout_started": "Stripe checkout opened",
  "billing.checkout_returned": "Came back from Stripe checkout",
};

/**
 * An audit row as a timeline line: the action's name and who did it, never its details (they can
 * hold ids only, but staff don't need them here). Staff rows read "Sam opened this page".
 */
export function auditEvent(
  row: { id: string; created_at: string; action: string; actor: string; details: unknown },
  actorName: (actor: string) => string,
): TimelineEvent {
  const kind: TimelineKind = row.action.startsWith("staff.")
    ? "staff"
    : row.action.startsWith("billing.checkout_")
      ? "checkout"
      : "audit";
  const known = AUDIT_TITLES[row.action];
  const who = actorName(row.actor);
  const plan =
    kind === "checkout" &&
    row.details &&
    typeof row.details === "object" &&
    typeof (row.details as Record<string, unknown>).plan === "string"
      ? planName((row.details as Record<string, string>).plan)
      : null;
  const title =
    kind === "staff"
      ? `${who} ${known ?? row.action}`
      : `${known ?? row.action}${plan ? ` (${plan})` : ""}`;
  return {
    id: `audit:${row.id}`,
    at: row.created_at,
    kind,
    title,
    detail: kind === "staff" ? null : `by ${who}`,
  };
}

export function attemptEvent(a: {
  id: string;
  platform: string;
  startedAt: string;
  outcome: string | null;
  outcomeAt: string | null;
  error: string | null;
  errorReason: string | null;
  isUserFixable: boolean | null;
}): TimelineEvent {
  const name = platformName(a.platform);
  const title =
    a.outcome === "connected"
      ? `${name} connected`
      : a.outcome === "failed"
        ? `${name} connect failed`
        : a.outcome === "returned_without_account"
          ? `Came back from ${name} without an account`
          : a.outcome === "abandoned"
            ? `${name} sign-in never came back`
            : `${name} sign-in started`;
  const parts = [
    a.errorReason ?? a.error,
    a.isUserFixable === true
      ? "user can fix"
      : a.isUserFixable === false
        ? "not user-fixable"
        : null,
  ].filter(Boolean);
  return {
    id: `connect:${a.id}`,
    at: a.outcomeAt ?? a.startedAt,
    kind: "connect",
    title,
    detail: parts.length ? parts.join(" · ") : null,
  };
}

/** A CRM event: its name and whether it reached HighLevel (never its details). */
export function crmEvent(e: {
  id: string;
  created_at: string;
  event: string;
  status: string;
  sent_at: string | null;
}): TimelineEvent {
  const state =
    e.status === "sent"
      ? "sent"
      : e.status === "pending"
        ? "waiting to send"
        : e.status === "failed"
          ? "failed to send"
          : "skipped";
  return {
    id: `crm:${e.id}`,
    at: e.sent_at ?? e.created_at,
    kind: "crm",
    title: `GoHighLevel: ${e.event.replace(/_/g, " ")}`,
    detail: `waggle-app-event · ${state}`,
  };
}

// ── Time ────────────────────────────────────────────────────────────────────────────────────────

/** "just now", "12 min ago", "3 h ago", "Yesterday", "5 days ago", then the date. */
export function ago(iso: string, now: Date): string {
  const ms = now.getTime() - Date.parse(iso);
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 14) return `${d} days ago`;
  return shortDate(iso);
}

// ── Permission gates ────────────────────────────────────────────────────────────────────────────

/**
 * What a staff member may do on a business's page: look with customers.view; act (send the
 * confirm email again) with customers.act too, and never on an offboarded business (read only).
 */
export function customerGates(
  permissions: ReadonlySet<string>,
  offboarded: boolean,
): { view: boolean; act: boolean; links: boolean } {
  const view = permissions.has("customers.view");
  return {
    view,
    act: view && permissions.has("customers.act") && !offboarded,
    links: view && !offboarded,
  };
}
