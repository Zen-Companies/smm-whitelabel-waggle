import "server-only";
import { loadTenantAiSpend, type AiSpend } from "@/lib/llm";
import type { ServiceClient } from "@/lib/supabase/service";
import { emailsOf } from "@/lib/supabase/users";
import {
  attemptEvent,
  auditEvent,
  chatAnswered,
  type AttemptLite,
  crmEvent,
  failedTries,
  type Flag,
  flagsFor,
  isInApp,
  isPaying,
  latest,
  latestAttempt,
  type ListParams,
  matchesAll,
  matchesBase,
  mergeTimeline,
  planOf,
  type PlanKind,
  rangeStart,
  type Source,
  type SourceKind,
  sourceOf,
  type Stage,
  stageCounts,
  stuckAt,
  type TimelineEvent,
  whereLine,
} from "./derive";

// Staff → Customers: the server reads (service role, after the permission check in the view).
// Counts, ids, codes and labels only; never a customer's message text (rule 10).

/** The newest businesses the list looks through (search and filters run over these). */
export const LIST_WINDOW = 1000;
const CHUNK = 150;

/** `.in()` over many ids, a chunk at a time (keeps the request URL short). */
async function inChunks<T>(
  ids: readonly string[],
  read: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await read(ids.slice(i, i + CHUNK));
    if (error) throw new Error(`customers: reading failed: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

const groupBy = <T>(rows: readonly T[], key: (r: T) => string): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
};

export interface CustomerRow {
  id: string;
  name: string;
  kind: string | null;
  ownerEmail: string | null;
  emailUnconfirmed: boolean;
  signedUpAt: string;
  source: SourceKind;
  sourceLabel: string | null;
  stage: Stage;
  where: string;
  lastActivityAt: string | null;
  browser: string | null;
  /** The newest connect try, for "In progress · N min" (staff connect trace, 26 Nov). */
  lastTry: { outcome: string | null; startedAt: string } | null;
  plan: PlanKind;
  planLabel: string;
  flags: Flag[];
  handles: string[];
}

interface Shared {
  tenants: {
    id: string;
    name: string;
    created_at: string;
    organization_id: string | null;
    setup_screen: string | null;
    setup_done_at: string | null;
    setup_passed_at: string | null;
    setup_chat: unknown;
    offboarded_at: string | null;
    is_test: boolean;
    zernio_profile_id: string | null;
  }[];
}

/** Everything the list and the detail page both derive from, for a set of businesses. */
async function gather(db: ServiceClient, tenants: Shared["tenants"]) {
  const ids = tenants.map((t) => t.id);
  const orgIds = [
    ...new Set(tenants.flatMap((t) => (t.organization_id ? [t.organization_id] : []))),
  ];
  const [accounts, attempts, catchUps, checkouts, owners, firstMembers, bills] = await Promise.all([
    inChunks(ids, (c) =>
      db
        .from("social_accounts")
        .select("tenant_id, platform, username, status, released_at, created_at")
        .in("tenant_id", c),
    ),
    inChunks(ids, (c) =>
      db
        .from("connect_attempts")
        .select("tenant_id, platform, outcome, started_at, outcome_at, user_agent_class")
        .in("tenant_id", c),
    ),
    inChunks(ids, (c) =>
      db.from("catch_ups").select("tenant_id, stage, finished_at").in("tenant_id", c),
    ),
    inChunks(ids, (c) =>
      db
        .from("audit_log")
        .select("tenant_id, action, created_at, details")
        .in("tenant_id", c)
        .in("action", ["billing.checkout_started", "billing.checkout_returned"]),
    ),
    inChunks(orgIds, (c) =>
      db
        .from("organization_members")
        .select("organization_id, user_id, created_at")
        .in("organization_id", c)
        .eq("role", "owner")
        .order("created_at"),
    ),
    inChunks(ids, (c) =>
      db
        .from("tenant_members")
        .select("tenant_id, user_id, created_at")
        .in("tenant_id", c)
        .order("created_at"),
    ),
    inChunks(orgIds, (c) =>
      db
        .from("org_billing")
        .select(
          "organization_id, plan, status, trial_ends_at, billing_interval, stripe_customer_id",
        )
        .in("organization_id", c),
    ),
  ]);

  const ownerOfOrg = new Map<string, string>();
  for (const o of owners)
    if (!ownerOfOrg.has(o.organization_id)) ownerOfOrg.set(o.organization_id, o.user_id);
  const firstMemberOf = new Map<string, string>();
  for (const m of firstMembers)
    if (!firstMemberOf.has(m.tenant_id)) firstMemberOf.set(m.tenant_id, m.user_id);
  const ownerOf = (t: Shared["tenants"][number]) =>
    (t.organization_id ? ownerOfOrg.get(t.organization_id) : undefined) ??
    firstMemberOf.get(t.id) ??
    null;
  const ownerIds = [...new Set(tenants.flatMap((t) => ownerOf(t) ?? []))];

  const [emails, confirmations, activity, signedUp] = await Promise.all([
    emailsOf(db, ownerIds),
    inChunks(ownerIds, (c) =>
      db.from("email_confirmations").select("user_id, confirmed_at, sent_at").in("user_id", c),
    ),
    inChunks(ownerIds, (c) =>
      db.from("user_activity").select("user_id, last_seen_at").in("user_id", c),
    ),
    inChunks(ownerIds, (c) =>
      db
        .from("crm_events")
        .select("user_id, details, created_at")
        .in("user_id", c)
        .eq("event", "signed_up"),
    ),
  ]);

  return {
    ownerOf,
    emails,
    accountsBy: groupBy(accounts, (a) => a.tenant_id),
    attemptsBy: groupBy(attempts, (a) => a.tenant_id),
    catchUpsBy: groupBy(catchUps, (c) => c.tenant_id),
    checkoutsBy: groupBy(checkouts, (c) => c.tenant_id),
    billOf: new Map(bills.map((b) => [b.organization_id, b])),
    confirmationOf: new Map(confirmations.map((c) => [c.user_id, c])),
    seenOf: new Map(activity.map((a) => [a.user_id, a.last_seen_at])),
    signedUpOf: new Map(signedUp.map((s) => [s.user_id, s])),
  };
}

type Gathered = Awaited<ReturnType<typeof gather>>;

const kindOf = (setupChat: unknown): string | null => {
  if (!setupChat || typeof setupChat !== "object" || Array.isArray(setupChat)) return null;
  const k = (setupChat as Record<string, unknown>).kind;
  return typeof k === "string" ? k : null;
};

const lastOf = (rows: readonly { action: string; created_at: string }[], action: string) =>
  rows
    .filter((r) => r.action === action)
    .reduce<string | null>((m, r) => latest(m, r.created_at), null);

function rowFor(
  t: Shared["tenants"][number],
  g: Gathered,
  now: Date,
): CustomerRow & { utm: Source["utm"] } {
  const ownerId = g.ownerOf(t);
  const accounts = g.accountsBy.get(t.id) ?? [];
  const live = accounts.filter((a) => !a.released_at);
  const attempts: AttemptLite[] = (g.attemptsBy.get(t.id) ?? []).map((a) => ({
    platform: a.platform,
    outcome: a.outcome,
    startedAt: a.started_at,
    userAgentClass: a.user_agent_class,
  }));
  const checkouts = g.checkoutsBy.get(t.id) ?? [];
  const startedAt = lastOf(checkouts, "billing.checkout_started");
  const lastStart = checkouts.find(
    (c) => c.action === "billing.checkout_started" && c.created_at === startedAt,
  );
  const startDetails = lastStart?.details as Record<string, unknown> | null | undefined;
  const bill = t.organization_id ? g.billOf.get(t.organization_id) : undefined;
  const plan = planOf(
    bill
      ? {
          plan: bill.plan,
          status: bill.status,
          trialEndsAt: bill.trial_ends_at,
          interval: bill.billing_interval,
        }
      : null,
  );
  const stage = stuckAt({
    connected: live.length > 0,
    setupDone: t.setup_done_at !== null || t.setup_passed_at !== null,
    setupScreen: t.setup_screen,
    checkoutStartedAt: startedAt,
    checkoutReturnedAt: lastOf(checkouts, "billing.checkout_returned"),
    billingStatus: bill?.status ?? null,
  });
  const lastTry = latestAttempt(attempts);
  const lastActivityAt = latest(
    ownerId ? g.seenOf.get(ownerId) : null,
    lastTry?.startedAt,
    ...(g.attemptsBy.get(t.id) ?? []).map((a) => a.outcome_at),
    startedAt,
  );
  const confirmation = ownerId ? g.confirmationOf.get(ownerId) : undefined;
  const source = sourceOf(ownerId ? (g.signedUpOf.get(ownerId) ?? null) : null);
  return {
    id: t.id,
    name: t.name,
    kind: kindOf(t.setup_chat),
    ownerEmail: ownerId ? (g.emails.get(ownerId) ?? null) : null,
    emailUnconfirmed: !!confirmation && !confirmation.confirmed_at,
    signedUpAt: t.created_at,
    source: source.kind,
    sourceLabel: source.label,
    utm: source.utm,
    stage,
    where: whereLine({
      stage,
      attempts,
      reading: (g.catchUpsBy.get(t.id) ?? []).some((c) => c.stage !== "done"),
      setupChat: t.setup_chat,
      checkoutPlan: typeof startDetails?.plan === "string" ? startDetails.plan : null,
      planLabel: plan.label,
    }),
    lastActivityAt,
    browser: lastTry?.userAgentClass ?? null,
    lastTry: lastTry ? { outcome: lastTry.outcome, startedAt: lastTry.startedAt } : null,
    plan: plan.kind,
    planLabel: plan.label,
    flags: flagsFor({
      stage,
      failedTries: failedTries(attempts),
      lastActivityAt,
      offboardedAt: t.offboarded_at,
      isTest: t.is_test,
      now,
    }),
    handles: accounts.flatMap((a) => (a.username ? [a.username] : [])),
  };
}

const TENANT_COLUMNS =
  "id, name, created_at, organization_id, setup_screen, setup_done_at, setup_passed_at, setup_chat, offboarded_at, is_test, zernio_profile_id";

export interface CustomerList {
  rows: CustomerRow[];
  /** Rows matching every filter (the list shows the first `shown`). */
  matching: number;
  counts: ReturnType<typeof stageCounts>;
  totalBusinesses: number;
  thisWeek: number;
  /** In-app browser share of those stuck at Connect, in the current filter. */
  connectInApp: { inApp: number; of: number };
  /** True when there are more businesses than the window looked through. */
  windowFull: boolean;
}

export async function loadCustomerList(
  db: ServiceClient,
  params: ListParams,
  now: Date,
): Promise<CustomerList> {
  const since = rangeStart(params.range, now);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let q = db.from("tenants").select(TENANT_COLUMNS).is("purged_at", null);
  if (since) q = q.gte("created_at", since.toISOString());
  const [list, total, week] = await Promise.all([
    q.order("created_at", { ascending: false }).limit(LIST_WINDOW),
    db.from("tenants").select("id", { count: "exact", head: true }).is("purged_at", null),
    db
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .is("purged_at", null)
      .gte("created_at", weekAgo),
  ]);
  if (list.error) throw new Error(`customers: reading failed: ${list.error.message}`);
  const tenants = list.data ?? [];
  const g = await gather(db, tenants);
  const all = tenants.map((t) => rowFor(t, g, now));
  const base = all.filter((r) => matchesBase(r, params));
  const matching = all.filter((r) => matchesAll(r, params));
  const stuckConnect = base.filter((r) => r.stage === "connect");
  return {
    rows: matching.slice(0, params.shown).map(({ utm, ...r }) => (void utm, r)),
    matching: matching.length,
    counts: stageCounts(base),
    totalBusinesses: total.count ?? 0,
    thisWeek: week.count ?? 0,
    connectInApp: {
      inApp: stuckConnect.filter((r) => isInApp(r.browser)).length,
      of: stuckConnect.length,
    },
    windowFull: tenants.length >= LIST_WINDOW,
  };
}

// ── One business ────────────────────────────────────────────────────────────────────────────────

export interface AttemptRow {
  id: string;
  platform: string;
  mode: string | null;
  startedAt: string;
  returnedAt: string | null;
  outcome: string | null;
  outcomeAt: string | null;
  error: string | null;
  errorReason: string | null;
  errorMessage: string | null;
  isUserFixable: boolean | null;
  stage: string | null;
  step: string | null;
  platformError: string | null;
  userAgentClass: string | null;
  userAgent: string | null;
  zernioRequestId: string | null;
  zernioAccountId: string | null;
  zernioProfileId: string | null;
}

export interface CustomerDetail {
  row: CustomerRow;
  source: Source;
  tenant: {
    id: string;
    name: string;
    createdAt: string;
    offboardedAt: string | null;
    setupScreen: string | null;
    setupDoneAt: string | null;
    setupPassedAt: string | null;
    setupChatAnswered: number;
    /** The brand's Zernio profile (what to search for in Zernio), set at sign-up. */
    zernioProfileId: string | null;
  };
  owner: {
    id: string | null;
    email: string | null;
    name: string | null;
    provider: string | null;
    emailConfirm: { sentAt: string; confirmedAt: string | null } | null;
    betaCode: string | null;
    betaVia: string | null;
  };
  org: {
    id: string | null;
    name: string | null;
    own: boolean;
    members: number;
    brands: { id: string; name: string }[];
  };
  funnel: {
    signedUp: string;
    connected: string | null;
    readDone: string | null;
    setupDone: string | null;
    /** Paying now; `at` is when the checkout came back or the subscription arrived, if logged. */
    paid: { at: string | null } | null;
  };
  attempts: AttemptRow[];
  timeline: TimelineEvent[];
  facts: { found: number; confirmed: number };
  accounts: {
    platform: string;
    username: string | null;
    status: string;
    connectedAt: string;
    released: boolean;
    tries: number;
  }[];
  triesByPlatformNotConnected: { platform: string; tries: number }[];
  billing: {
    stripeCustomerId: string | null;
    subscriptionStatus: string | null;
    planLabel: string;
    checkoutsStarted: number;
    checkoutsReturned: number;
    aiSpend: AiSpend | null;
  };
  ghlContactId: string | null;
}

const isStaffName = (email: string | undefined) => (email ? email.split("@")[0] : null);

export async function loadCustomerDetail(
  db: ServiceClient,
  tenantId: string,
  now: Date,
): Promise<CustomerDetail | null> {
  const { data: t, error } = await db
    .from("tenants")
    .select(TENANT_COLUMNS)
    .eq("id", tenantId)
    .is("purged_at", null)
    .maybeSingle();
  if (error) throw new Error(`customers: reading failed: ${error.message}`);
  if (!t) return null;
  const g = await gather(db, [t]);
  const row = rowFor(t, g, now);
  const ownerId = g.ownerOf(t);

  const [
    attempts,
    audit,
    crm,
    confirmation,
    beta,
    org,
    members,
    brands,
    catchUps,
    facts,
    mornings,
    aiSpend,
    authUser,
  ] = await Promise.all([
    db
      .from("connect_attempts")
      .select(
        "id, platform, mode, started_at, returned_at, outcome, outcome_at, error, error_reason, error_message, is_user_fixable, stage, step, platform_error, user_agent_class, user_agent, zernio_request_id, zernio_account_id, zernio_profile_id",
      )
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false })
      .limit(100),
    db
      .from("audit_log")
      .select("id, created_at, action, actor, details")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(300),
    ownerId
      ? db
          .from("crm_events")
          .select("id, created_at, event, status, sent_at, ghl_contact_id")
          .eq("user_id", ownerId)
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    ownerId
      ? db
          .from("email_confirmations")
          .select("sent_at, confirmed_at")
          .eq("user_id", ownerId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    ownerId
      ? db.from("beta_access").select("via, beta_codes(code)").eq("user_id", ownerId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    t.organization_id
      ? db
          .from("organizations")
          .select("id, name, personal_of")
          .eq("id", t.organization_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    t.organization_id
      ? db
          .from("organization_members")
          .select("user_id", { count: "exact", head: true })
          .eq("organization_id", t.organization_id)
      : Promise.resolve({ count: 0, error: null }),
    t.organization_id
      ? db
          .from("tenants")
          .select("id, name")
          .eq("organization_id", t.organization_id)
          .is("purged_at", null)
          .order("created_at")
      : Promise.resolve({ data: [{ id: t.id, name: t.name }], error: null }),
    db.from("catch_ups").select("finished_at, stage").eq("tenant_id", tenantId),
    db
      .from("kb_entries")
      .select("needs_check")
      .eq("tenant_id", tenantId)
      .not("found_kind", "is", null),
    t.organization_id
      ? db
          .from("first_morning_emails")
          .select("created_at, sent_at, outcome")
          .eq("organization_id", t.organization_id)
      : Promise.resolve({ data: [], error: null }),
    loadTenantAiSpend(db, tenantId, now).catch(() => null),
    ownerId ? db.auth.admin.getUserById(ownerId) : Promise.resolve(null),
  ]);

  // Who did each audited thing: staff and owners by the start of their email.
  const actorIds = [
    ...new Set((audit.data ?? []).map((a) => a.actor).filter((a) => /^[0-9a-f-]{36}$/i.test(a))),
  ];
  const [actorEmails, staffRoles] = await Promise.all([
    emailsOf(db, actorIds),
    actorIds.length
      ? db.from("staff_members").select("user_id, role").in("user_id", actorIds)
      : Promise.resolve({ data: [] as { user_id: string; role: string }[], error: null }),
  ]);
  const roleOf = new Map((staffRoles.data ?? []).map((s) => [s.user_id, s.role]));
  const actorName = (actor: string) => {
    if (actor === "system") return "Waggle";
    if (actor === ownerId) return "the owner";
    const who = isStaffName(actorEmails.get(actor)) ?? "someone";
    const role = roleOf.get(actor);
    return role ? `${who} (${role})` : who;
  };

  const attemptRows: AttemptRow[] = (attempts.data ?? []).map((a) => ({
    id: a.id,
    platform: a.platform,
    mode: a.mode,
    startedAt: a.started_at,
    returnedAt: a.returned_at,
    outcome: a.outcome,
    outcomeAt: a.outcome_at,
    error: a.error,
    errorReason: a.error_reason,
    errorMessage: a.error_message,
    isUserFixable: a.is_user_fixable,
    stage: a.stage,
    step: a.step,
    platformError: a.platform_error,
    userAgentClass: a.user_agent_class,
    userAgent: a.user_agent,
    zernioRequestId: a.zernio_request_id,
    zernioAccountId: a.zernio_account_id,
    zernioProfileId: a.zernio_profile_id,
  }));

  const emailEvents: TimelineEvent[] = [];
  const conf = confirmation.data;
  if (conf) {
    emailEvents.push({
      id: "email:confirm-sent",
      at: conf.sent_at,
      kind: "email",
      title: "Confirm email sent",
      detail: "Resend",
    });
    if (conf.confirmed_at) {
      emailEvents.push({
        id: "email:confirmed",
        at: conf.confirmed_at,
        kind: "email",
        title: "Email confirmed",
        detail: null,
      });
    }
  }
  for (const [i, m] of (mornings.data ?? []).entries()) {
    emailEvents.push({
      id: `email:morning:${i}`,
      at: m.sent_at ?? m.created_at,
      kind: "email",
      title: m.sent_at ? "First-morning email sent" : "First-morning email not sent",
      detail: m.outcome,
    });
  }

  const timeline = mergeTimeline(
    (audit.data ?? []).map((a) => auditEvent(a, actorName)),
    attemptRows.map(attemptEvent),
    (crm.data ?? []).map(crmEvent),
    emailEvents,
  );

  const accounts = g.accountsBy.get(t.id) ?? [];
  const triesOn = (p: string) => attemptRows.filter((a) => a.platform === p).length;
  const connectedAt = accounts.reduce<string | null>(
    (m, a) => (!m || a.created_at < m ? a.created_at : m),
    null,
  );
  const readDone =
    (catchUps.data ?? [])
      .map((c) => c.finished_at)
      .filter((x): x is string => !!x)
      .sort()[0] ?? null;
  const paidAt =
    (audit.data ?? [])
      .filter(
        (a) => a.action === "billing.checkout_returned" || a.action === "billing.subscription",
      )
      .map((a) => a.created_at)
      .sort()[0] ?? null;
  const bill = t.organization_id ? g.billOf.get(t.organization_id) : undefined;
  const checkouts = g.checkoutsBy.get(t.id) ?? [];
  const user = authUser?.data.user ?? null;
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    typeof meta.full_name === "string"
      ? meta.full_name
      : typeof meta.name === "string"
        ? meta.name
        : null;
  const betaRow = beta.data as { via: string; beta_codes: { code: string } | null } | null;
  const accountPlatforms = new Set(accounts.filter((a) => !a.released_at).map((a) => a.platform));

  return {
    row: (({ utm, ...r }) => (void utm, r))(row),
    source: { kind: row.source, label: row.sourceLabel, utm: row.utm },
    tenant: {
      id: t.id,
      name: t.name,
      createdAt: t.created_at,
      offboardedAt: t.offboarded_at,
      setupScreen: t.setup_screen,
      setupDoneAt: t.setup_done_at,
      setupPassedAt: t.setup_passed_at,
      setupChatAnswered: chatAnswered(t.setup_chat),
      zernioProfileId: t.zernio_profile_id,
    },
    owner: {
      id: ownerId,
      email: row.ownerEmail,
      name,
      provider:
        typeof user?.app_metadata?.provider === "string" ? user.app_metadata.provider : null,
      emailConfirm: conf ? { sentAt: conf.sent_at, confirmedAt: conf.confirmed_at } : null,
      betaCode: betaRow?.beta_codes?.code ?? null,
      betaVia: betaRow?.via ?? null,
    },
    org: {
      id: org.data?.id ?? null,
      name: org.data?.name ?? null,
      own: !!org.data?.personal_of,
      members: members.count ?? 0,
      brands: brands.data ?? [],
    },
    funnel: {
      signedUp: t.created_at,
      connected: connectedAt,
      readDone,
      setupDone: t.setup_done_at ?? t.setup_passed_at,
      paid: bill && isPaying(bill.status) ? { at: paidAt } : null,
    },
    attempts: attemptRows,
    timeline,
    facts: {
      found: (facts.data ?? []).length,
      confirmed: (facts.data ?? []).filter((f) => !f.needs_check).length,
    },
    accounts: accounts.map((a) => ({
      platform: a.platform,
      username: a.username,
      status: a.status,
      connectedAt: a.created_at,
      released: !!a.released_at,
      tries: triesOn(a.platform),
    })),
    triesByPlatformNotConnected: [...new Set(attemptRows.map((a) => a.platform))]
      .filter((p) => !accountPlatforms.has(p))
      .map((p) => ({ platform: p, tries: triesOn(p) })),
    billing: {
      stripeCustomerId: bill?.stripe_customer_id ?? null,
      subscriptionStatus: bill?.status ?? null,
      planLabel: row.planLabel,
      checkoutsStarted: checkouts.filter((c) => c.action === "billing.checkout_started").length,
      checkoutsReturned: checkouts.filter((c) => c.action === "billing.checkout_returned").length,
      aiSpend,
    },
    ghlContactId: (crm.data ?? []).find((c) => c.ghl_contact_id)?.ghl_contact_id ?? null,
  };
}

/** A business's name, whether it's offboarded, and its owner (the organization's, else the first member). */
export async function tenantOwner(
  db: ServiceClient,
  tenantId: string,
): Promise<{ name: string; offboarded: boolean; ownerId: string | null } | null> {
  const { data: t } = await db
    .from("tenants")
    .select("name, organization_id, offboarded_at")
    .eq("id", tenantId)
    .is("purged_at", null)
    .maybeSingle();
  if (!t) return null;
  let ownerId: string | null = null;
  if (t.organization_id) {
    const { data } = await db
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", t.organization_id)
      .eq("role", "owner")
      .order("created_at")
      .limit(1);
    ownerId = data?.[0]?.user_id ?? null;
  }
  if (!ownerId) {
    const { data } = await db
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .order("created_at")
      .limit(1);
    ownerId = data?.[0]?.user_id ?? null;
  }
  return { name: t.name, offboarded: t.offboarded_at !== null, ownerId };
}
