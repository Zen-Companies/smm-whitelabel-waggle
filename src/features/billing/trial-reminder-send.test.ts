import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { Email, Mailer } from "@/lib/email/mailer";
import type { ServiceClient } from "@/lib/supabase/service";

// The reminder before the first charge (Pricing Bible, 24 Nov): the webhook stores one row per
// subscription, the jobs route emails the confirmed Owner(s) once, and nothing goes out for a
// trial that is cancelling or over. Mocked database and mailer: no email leaves.

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
const unconfirmed = new Set<string>();
vi.mock("@/lib/email/confirmations", () => ({
  unconfirmedUserIds: async () => unconfirmed,
}));

const { queueTrialReminder, sendTrialReminders } = await import("./trial-reminder-send");

type Row = Record<string, unknown>;

/** A tiny in-memory stand-in for the few queries these functions make. */
function fakeDb(init: { reminders?: Row[]; bill?: Row | null; team?: Row[] }) {
  const reminders: Row[] = [...(init.reminders ?? [])];
  const audits: Row[] = [];
  const bill = init.bill ?? null;
  const team = init.team ?? [];
  const from = (table: string) => {
    const q = {
      op: "select" as "select" | "update" | "upsert" | "insert",
      patch: null as Row | null,
      filters: [] as [string, unknown][],
      select: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: () => q,
      eq: (c: string, v: unknown) => (q.filters.push([c, v]), q),
      update: (p: Row) => ((q.op = "update"), (q.patch = p), q),
      upsert: (p: Row) => ((q.op = "upsert"), (q.patch = p), q),
      insert: (p: Row) => ((q.op = "insert"), (q.patch = p), q),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    };
    const match = (r: Row) => q.filters.every(([c, v]) => r[c] === v);
    const run = () => {
      if (table === "org_billing") return { data: bill, error: null };
      if (table === "organizations") return { data: { name: "Harbour Bean Café" }, error: null };
      if (table === "organization_audit") {
        audits.push(q.patch!);
        return { data: null, error: null };
      }
      // trial_reminders
      if (q.op === "upsert") {
        const id = q.patch!.stripe_subscription_id;
        if (reminders.some((r) => r.stripe_subscription_id === id))
          return { data: [], error: null };
        reminders.push({ status: "queued", ...q.patch });
        return { data: [{ stripe_subscription_id: id }], error: null };
      }
      if (q.op === "update") {
        const hit = reminders.filter(match);
        for (const r of hit) Object.assign(r, q.patch);
        return {
          data: hit.map((r) => ({ stripe_subscription_id: r.stripe_subscription_id })),
          error: null,
        };
      }
      return { data: reminders.filter(match), error: null };
    };
    return q;
  };
  const client = {
    from,
    rpc: async () => ({ data: team, error: null }),
  } as unknown as ServiceClient;
  return { client, reminders, audits };
}

function mailer(fail = false) {
  const sent: Email[] = [];
  const m: Mailer = {
    send: vi.fn(async (e: Email) => {
      if (fail) throw new Error("down");
      sent.push(e);
      return { providerId: "re_1", mode: "sent" as const };
    }),
  };
  return { m, sent };
}

const TRIAL_END = "2026-12-24T10:00:00.000Z";
const NOW = new Date("2026-12-21T10:00:00Z");
const queued = (over: Row = {}): Row => ({
  stripe_subscription_id: "sub_1",
  organization_id: "org-1",
  plan: "solo",
  billing_interval: "month",
  amount_cents: 4900,
  charge_at: TRIAL_END,
  status: "queued",
  ...over,
});
const trialing = {
  stripe_subscription_id: "sub_1",
  status: "trialing",
  cancel_at_period_end: false,
  trial_ends_at: TRIAL_END,
};
const owner = { user_id: "u-1", email: "owner@example.com", full_name: "Febron S", role: "owner" };
const member = { user_id: "u-2", email: "member@example.com", full_name: "M", role: "member" };
const run = (db: ServiceClient, m: Mailer) =>
  sendTrialReminders({
    db,
    mailer: m,
    appUrl: "https://app.example.com",
    now: NOW,
    shouldContinue: () => true,
  });

beforeEach(() => unconfirmed.clear());

describe("the webhook stores one reminder per subscription", () => {
  const sub = {
    id: "sub_1",
    status: "trialing",
    customer: "cus_1",
    cancel_at_period_end: false,
    trial_end: Date.parse(TRIAL_END) / 1000,
    trial_start: Date.parse(TRIAL_END) / 1000 - 30 * 86_400,
    metadata: { organization_id: "org-1" },
    items: {
      data: [
        {
          quantity: 1,
          current_period_end: 1,
          price: { lookup_key: "waggle_solo_monthly", unit_amount: 4900 },
        },
        {
          quantity: 1,
          current_period_end: 1,
          price: { lookup_key: "waggle_extra_account_monthly", unit_amount: 1000 },
        },
      ],
    },
  } as unknown as Stripe.Subscription;

  it("queues it with the plan, the amount and the charge date, then never again", async () => {
    const d = fakeDb({});
    expect(await queueTrialReminder(d.client, "org-1", sub)).toBe("trial reminder queued");
    expect(d.reminders).toEqual([
      expect.objectContaining({
        stripe_subscription_id: "sub_1",
        organization_id: "org-1",
        plan: "solo",
        amount_cents: 5900,
        charge_at: TRIAL_END,
        status: "queued",
      }),
    ]);
    // Stripe sends it again (a retry, or the trial moved): still one reminder.
    expect(await queueTrialReminder(d.client, "org-1", sub)).toBe("");
    expect(d.reminders).toHaveLength(1);
  });

  it("stores nothing for a trial already set to cancel", async () => {
    const d = fakeDb({});
    const cancelling = { ...sub, cancel_at_period_end: true } as Stripe.Subscription;
    expect(await queueTrialReminder(d.client, "org-1", cancelling)).toBe("");
    expect(d.reminders).toHaveLength(0);
  });
});

describe("the jobs route emails the Owner(s) once", () => {
  it("sends to each confirmed Owner, marks it sent and audits it", async () => {
    const d = fakeDb({ reminders: [queued()], bill: trialing, team: [owner, member] });
    const { m, sent } = mailer();
    expect(await run(d.client, m)).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: ["owner@example.com"],
      subject: "Your free month ends soon: $49 on December 24",
      idempotencyKey: "trial-reminder:sub_1:u-1",
    });
    expect(d.reminders[0]).toMatchObject({ status: "sent" });
    expect(d.audits[0]).toMatchObject({
      action: "billing.trial_reminder_sent",
      organization_id: "org-1",
    });
    // The next run finds nothing queued.
    expect(await run(d.client, m)).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(sent).toHaveLength(1);
  });

  it("skips a trial that was cancelled or already ended", async () => {
    const cancelling = fakeDb({
      reminders: [queued()],
      bill: { ...trialing, cancel_at_period_end: true },
      team: [owner],
    });
    const { m, sent } = mailer();
    expect(await run(cancelling.client, m)).toMatchObject({ skipped: 1 });
    expect(cancelling.reminders[0]).toMatchObject({ status: "skipped", reason: "cancelling" });
    const ended = fakeDb({
      reminders: [queued()],
      bill: { ...trialing, status: "active" },
      team: [owner],
    });
    await run(ended.client, m);
    expect(ended.reminders[0]).toMatchObject({ status: "skipped", reason: "not_trialing" });
    expect(sent).toHaveLength(0);
  });

  it("never emails an address that isn't confirmed", async () => {
    unconfirmed.add("u-1");
    const d = fakeDb({ reminders: [queued()], bill: trialing, team: [owner] });
    const { m, sent } = mailer();
    expect(await run(d.client, m)).toMatchObject({ skipped: 1 });
    expect(d.reminders[0]).toMatchObject({ status: "skipped", reason: "no_owner" });
    expect(sent).toHaveLength(0);
  });

  it("hands it back for the next run when the mailer fails", async () => {
    const d = fakeDb({ reminders: [queued()], bill: trialing, team: [owner] });
    const { m } = mailer(true);
    expect(await run(d.client, m)).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect(d.reminders[0]).toMatchObject({ status: "queued" });
  });
});
