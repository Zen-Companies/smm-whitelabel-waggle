import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { ServiceClient } from "@/lib/supabase/service";

// The referrer's month (review of PR #63): claimed before Stripe is called, looked up in Stripe
// before it's made, every write checked; banked months of a referrer with a plan again are
// credited; the program that ran when the friend joined decides the reward; audit rows.

const auditOrg = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock("./billing-store", () => ({ auditOrg: (...a: unknown[]) => auditOrg(...a) }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/crm", () => ({
  creditedMonthEnd: () => null,
  friendMonthApplied: () => false,
  queueForOwners: vi.fn(async () => undefined),
  queueQuietly: vi.fn(async () => undefined),
  referralDedupeKey: (id: string, role: string) => `referral_rewarded:${id}:${role}`,
  referralSendAfter: () => null,
}));
vi.mock("./promotions-store", async () => {
  const { PROMOTIONS } = await import("./promotions");
  return { loadPromotions: async () => PROMOTIONS };
});

const { grantReferralRewards, markBankedUsed, markReferralRewardDue } = await import("./referrals");

// ---- A small fake of the Supabase query builder ----

interface Call {
  table: string;
  op: "select" | "update" | "insert" | "upsert";
  patch?: Record<string, unknown>;
  filters: [string, string, unknown][];
}
type Res = { data: unknown; error: { message: string } | null };

class Query implements PromiseLike<Res> {
  call: Call;
  constructor(
    table: string,
    private handler: (c: Call) => Res,
    calls: Call[],
  ) {
    this.call = { table, op: "select", filters: [] };
    calls.push(this.call);
  }
  select() {
    return this;
  }
  update(patch: Record<string, unknown>) {
    this.call.op = "update";
    this.call.patch = patch;
    return this;
  }
  eq(col: string, v: unknown) {
    this.call.filters.push(["eq", col, v]);
    return this;
  }
  lt(col: string, v: unknown) {
    this.call.filters.push(["lt", col, v]);
    return this;
  }
  in(col: string, v: unknown) {
    this.call.filters.push(["in", col, v]);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  maybeSingle() {
    return this;
  }
  then<A = Res, B = never>(
    ok?: ((v: Res) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.handler(this.call)).then(ok, fail);
  }
}

const filter = (c: Call, col: string, op = "eq") =>
  c.filters.find((f) => f[0] === op && f[1] === col)?.[2];

const DURING = "2026-11-25T12:00:00Z";
const AFTER = "2026-12-05T12:00:00Z";
const row = (over: Partial<Record<string, string>> = {}) => ({
  id: "11111111-1111-1111-1111-111111111111",
  referrer_org_id: "org-referrer",
  referred_org_id: "org-friend",
  created_at: DURING,
  ...over,
});
const liveBill = {
  organization_id: "org-referrer",
  stripe_customer_id: "cus_1",
  stripe_subscription_id: "sub_1",
  plan: "solo",
  billing_interval: "month",
  status: "active",
  founding: false,
  current_period_end: "2026-12-20T00:00:00Z",
};

interface World {
  due?: ReturnType<typeof row>[];
  banked?: ReturnType<typeof row>[];
  bill?: typeof liveBill | null;
  /** The status the row is in (claims only succeed from it). */
  status?: string;
  failSettle?: boolean;
}

function db(world: World) {
  const calls: Call[] = [];
  let status = world.status ?? "reward_due";
  const handler = (c: Call): Res => {
    if (c.table === "org_billing") {
      if (filter(c, "organization_id")) return { data: world.bill ?? null, error: null };
      return { data: world.bill ? [world.bill] : [], error: null };
    }
    if (c.op === "select") {
      const s = filter(c, "status");
      if (s === "reward_due") return { data: world.due ?? [], error: null };
      if (s === "banked") return { data: world.banked ?? [], error: null };
      return { data: [], error: null };
    }
    // An update: only from the status it names.
    const from = filter(c, "status");
    if (from !== undefined && from !== status) return { data: [], error: null };
    const next = c.patch?.status as string;
    if (world.failSettle && from === "crediting" && next === "rewarded") {
      return { data: null, error: { message: "network" } };
    }
    status = next ?? status;
    return { data: [{ id: row().id, referrer_org_id: "org-referrer" }], error: null };
  };
  const client = { from: (t: string) => new Query(t, handler, calls) };
  return { client: client as unknown as ServiceClient, calls, status: () => status };
}

async function* list<T>(items: T[]) {
  for (const i of items) yield i;
}

function stripe(
  opts: { existing?: { id: string; amount: number; metadata: object }[]; subMeta?: object } = {},
) {
  const createBalanceTransaction = vi.fn(async () => ({ id: "cbtxn_new", amount: -1900 }));
  const listBalanceTransactions = vi.fn(() => list(opts.existing ?? []));
  const retrieve = vi.fn(async () => ({ id: "sub_1", metadata: opts.subMeta ?? {} }));
  const client = {
    customers: { createBalanceTransaction, listBalanceTransactions },
    subscriptions: { retrieve },
  } as unknown as Stripe;
  return { client, createBalanceTransaction, listBalanceTransactions, retrieve };
}

const updates = (calls: Call[]) =>
  calls.filter((c) => c.table === "referrals" && c.op === "update").map((c) => c.patch?.status);

beforeEach(() => auditOrg.mockClear());

describe("crediting the referrer's month", () => {
  it("claims the row before calling Stripe, then records the credit", async () => {
    const d = db({ due: [row()], bill: liveBill });
    const s = stripe();
    const r = await grantReferralRewards({ db: d.client, stripe: s.client, now: new Date(AFTER) });
    expect(r).toEqual({ credited: 1, banked: 0, failed: 0 });
    expect(updates(d.calls)).toEqual(["crediting", "rewarded"]);
    expect(s.createBalanceTransaction).toHaveBeenCalledTimes(1);
    expect(s.createBalanceTransaction.mock.calls[0]).toEqual([
      "cus_1",
      expect.objectContaining({ metadata: { kind: "referral", referral_id: row().id } }),
      { idempotencyKey: `referral:${row().id}` },
    ]);
    expect(d.status()).toBe("rewarded");
    expect(auditOrg).toHaveBeenCalledWith(
      expect.anything(),
      "org-referrer",
      "referral.rewarded",
      "system",
      expect.objectContaining({ referralId: row().id }),
    );
  });

  it("never credits twice: a credit already in Stripe for the referral is reused", async () => {
    const d = db({ due: [row()], bill: liveBill });
    const s = stripe({
      existing: [
        { id: "cbtxn_other", amount: -500, metadata: { referral_id: "someone-else" } },
        { id: "cbtxn_old", amount: -1900, metadata: { referral_id: row().id } },
      ],
    });
    const r = await grantReferralRewards({ db: d.client, stripe: s.client, now: new Date(AFTER) });
    expect(r.credited).toBe(1);
    expect(s.createBalanceTransaction).not.toHaveBeenCalled();
    const settled = d.calls.find((c) => c.patch?.status === "rewarded");
    expect(settled?.patch).toMatchObject({ stripe_ref: "cbtxn_old", reward_cents: 1900 });
  });

  it("a failed save counts as failed and hands the row back, never left as rewarded", async () => {
    const d = db({ due: [row()], bill: liveBill, failSettle: true });
    const s = stripe();
    const r = await grantReferralRewards({ db: d.client, stripe: s.client, now: new Date(AFTER) });
    expect(r).toEqual({ credited: 0, banked: 0, failed: 1 });
    expect(updates(d.calls)).toEqual(["crediting", "rewarded", "reward_due"]);
    expect(d.status()).toBe("reward_due");
  });

  it("skips a row another run already claimed, without calling Stripe", async () => {
    const d = db({ due: [row()], bill: liveBill, status: "crediting" });
    const s = stripe();
    const r = await grantReferralRewards({ db: d.client, stripe: s.client, now: new Date(AFTER) });
    expect(r).toEqual({ credited: 0, banked: 0, failed: 0 });
    expect(s.listBalanceTransactions).not.toHaveBeenCalled();
    expect(s.createBalanceTransaction).not.toHaveBeenCalled();
  });

  it("banks the month for a referrer still on Free", async () => {
    const d = db({ due: [row()], bill: null });
    const s = stripe();
    const r = await grantReferralRewards({ db: d.client, stripe: s.client, now: new Date(AFTER) });
    expect(r).toEqual({ credited: 0, banked: 1, failed: 0 });
    expect(d.status()).toBe("banked");
    expect(s.createBalanceTransaction).not.toHaveBeenCalled();
  });

  it("owes nothing when no referral program ran when the friend joined", async () => {
    const d = db({ due: [row({ created_at: AFTER })], bill: liveBill });
    const s = stripe();
    await grantReferralRewards({ db: d.client, stripe: s.client, now: new Date(AFTER) });
    expect(d.status()).toBe("no_reward");
    expect(s.createBalanceTransaction).not.toHaveBeenCalled();
  });
});

describe("banked months of a referrer with a plan again", () => {
  it("are credited to the Stripe balance", async () => {
    const d = db({ banked: [row()], bill: liveBill, status: "banked" });
    const s = stripe();
    const r = await grantReferralRewards({ db: d.client, stripe: s.client, now: new Date(AFTER) });
    expect(r.credited).toBe(1);
    expect(s.createBalanceTransaction).toHaveBeenCalledTimes(1);
    expect(d.status()).toBe("rewarded");
  });

  it("aren't credited when a first checkout's trial already used them", async () => {
    const d = db({ banked: [row()], bill: liveBill, status: "banked" });
    const s = stripe({ subMeta: { banked_referrals: row().id } });
    await grantReferralRewards({ db: d.client, stripe: s.client, now: new Date(AFTER) });
    expect(s.createBalanceTransaction).not.toHaveBeenCalled();
    const settled = d.calls.find((c) => c.patch?.status === "rewarded");
    expect(settled?.patch).toMatchObject({ stripe_ref: "sub_1", reward_cents: 0 });
  });
});

describe("the Stripe webhook's referral writes", () => {
  it("audit the month falling due", async () => {
    const d = db({ status: "signed_up" });
    expect(await markReferralRewardDue(d.client, "org-friend")).toBe("referral reward due");
    expect(auditOrg).toHaveBeenCalledWith(
      expect.anything(),
      "org-referrer",
      "referral.reward_due",
      "system",
      expect.objectContaining({ referralId: row().id, referredOrgId: "org-friend" }),
    );
  });

  it("audit banked months used by a first checkout", async () => {
    const d = db({ status: "banked" });
    await markBankedUsed(d.client, "org-referrer", row().id, "cs_1");
    expect(auditOrg).toHaveBeenCalledWith(
      expect.anything(),
      "org-referrer",
      "referral.banked_used",
      "system",
      expect.objectContaining({ referralId: row().id, checkoutSessionId: "cs_1" }),
    );
  });
});
