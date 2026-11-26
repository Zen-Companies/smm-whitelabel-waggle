import { flagsFor, latest, planOf, type Source, sourceOf } from "./derive";
import type { CustomerRow } from "./load";

// Staff → Customers: sign-ups with no business (26 Nov). A business is made only when a new owner
// taps a platform on setup's Connect step, so a login that never did has an organization but no
// tenant, and the list (which reads tenants) never showed it. Pure, tested. Ids and labels only.

/** The detail page of a sign-up with no business (the business page stays /admin/customers/<id>). */
export const signupHref = (userId: string): string => `/admin/customers/user/${userId}`;

/** "Google", "email", another provider as given, or null when unknown. */
export function signInMethod(provider: string | null | undefined): string | null {
  if (!provider) return null;
  if (provider === "google") return "Google";
  if (provider === "email") return "email";
  return provider;
}

/**
 * The logins that have an organization but no business in any organization they belong to (nor
 * a business shared with them directly), leaving out staff. Order of `candidates` is kept.
 */
export function usersWithoutBusiness(input: {
  candidates: readonly string[];
  memberships: readonly { user_id: string; organization_id: string }[];
  /** Organizations that hold at least one business (deleted ones count: they had one). */
  orgsWithBusiness: ReadonlySet<string>;
  /** Logins with a row in tenant_members (a business shared with them directly). */
  tenantMembers: ReadonlySet<string>;
  staff: ReadonlySet<string>;
}): string[] {
  const orgsOf = new Map<string, string[]>();
  for (const m of input.memberships) {
    const list = orgsOf.get(m.user_id);
    if (list) list.push(m.organization_id);
    else orgsOf.set(m.user_id, [m.organization_id]);
  }
  const seen = new Set<string>();
  return input.candidates.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    const orgs = orgsOf.get(id) ?? [];
    return (
      orgs.length > 0 &&
      !orgs.some((o) => input.orgsWithBusiness.has(o)) &&
      !input.tenantMembers.has(id) &&
      !input.staff.has(id)
    );
  });
}

export interface SignupFacts {
  userId: string;
  email: string | null;
  name: string | null;
  /** auth.users.created_at, else when their organization was made. */
  signedUpAt: string;
  provider: string | null;
  orgName: string | null;
  confirmation: { confirmed_at: string | null } | null;
  bill: {
    plan: string | null;
    status: string | null;
    trial_ends_at: string | null;
    billing_interval: string | null;
  } | null;
  /** The `signed_up` CRM event (first-touch UTMs), if any. */
  signedUpEvent: { details: unknown } | null;
  lastSeenAt: string | null;
}

/** One list row for a sign-up with no business: "No business yet", never tapped Connect. */
export function signupRow(f: SignupFacts, now: Date): CustomerRow & { utm: Source["utm"] } {
  const plan = planOf(
    f.bill
      ? {
          plan: f.bill.plan,
          status: f.bill.status,
          trialEndsAt: f.bill.trial_ends_at,
          interval: f.bill.billing_interval,
        }
      : null,
  );
  const source = sourceOf(f.signedUpEvent);
  const lastActivityAt = latest(f.lastSeenAt);
  return {
    id: f.userId,
    href: signupHref(f.userId),
    name: "No business yet",
    kind: null,
    ownerEmail: f.email,
    ownerName: f.name,
    emailUnconfirmed: !!f.confirmation && !f.confirmation.confirmed_at,
    signedUpAt: f.signedUpAt,
    signUpMethod: signInMethod(f.provider),
    source: source.kind,
    sourceLabel: source.label,
    utm: source.utm,
    stage: "no_business",
    where: f.orgName ? `Organization: ${f.orgName}` : "No organization name",
    lastActivityAt,
    browser: null,
    lastTry: null,
    plan: plan.kind,
    planLabel: plan.label,
    flags: flagsFor({
      stage: "no_business",
      failedTries: 0,
      lastActivityAt,
      offboardedAt: null,
      isTest: false,
      now,
    }),
    handles: [],
  };
}

/**
 * Business rows and sign-up rows in one list, newest sign-up first (ties keep their order). By
 * time, not by string: auth timestamps end in Z, Postgres ones in +00:00.
 */
export function mergeBySignup<T extends { signedUpAt: string }>(...lists: readonly T[][]): T[] {
  return lists
    .flat()
    .map((r, i) => ({ r, i, t: Date.parse(r.signedUpAt) || 0 }))
    .sort((a, b) => (a.t === b.t ? a.i - b.i : b.t - a.t))
    .map(({ r }) => r);
}
