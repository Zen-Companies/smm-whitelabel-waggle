import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { ServiceClient } from "@/lib/supabase/service";

// Review of release #78: Stripe's trial_will_end is queued as a reminder even when it lands after
// a newer event for the same subscription (it's the only one Stripe sends). Mocked database.

vi.mock("server-only", () => ({}));
const queueTrialReminder = vi.fn(async () => "trial reminder queued");
vi.mock("./trial-reminder-send", () => ({
  queueTrialReminder: (...a: unknown[]) => queueTrialReminder(...(a as [])),
}));
vi.mock("./usage-charges", () => ({ queueUsageCharge: vi.fn() }));
vi.mock("./referrals", () => ({
  markBankedUsed: vi.fn(),
  markReferralRewardDue: vi.fn(),
  queueReferralMonthsApplied: vi.fn(),
}));
vi.mock("@/lib/crm", () => ({
  lifecycleEvents: () => [],
  organizationHasPaid: async () => false,
  queueForOwners: vi.fn(),
  queueQuietly: vi.fn(),
}));
const writeAudit = vi.fn(async () => undefined);
vi.mock("@/lib/audit", () => ({ writeAudit: (...a: unknown[]) => writeAudit(...(a as [])) }));

const { applyStripeEvent } = await import("./billing-store");

const TRIAL_END = Date.parse("2026-12-24T10:00:00Z") / 1000;
const sub = {
  id: "sub_1",
  status: "trialing",
  customer: "cus_1",
  cancel_at_period_end: false,
  cancel_at: null,
  trial_start: TRIAL_END - 30 * 86_400,
  trial_end: TRIAL_END,
  metadata: { organization_id: "org-1" },
  items: {
    data: [
      {
        quantity: 1,
        current_period_end: TRIAL_END,
        price: { lookup_key: "waggle_solo_monthly", unit_amount: 4900 },
      },
    ],
  },
} as unknown as Stripe.Subscription;

function fakeDb(stored: Record<string, unknown>) {
  const writes: string[] = [];
  const from = (table: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      is: () => q,
      order: () => q,
      limit: () => Promise.resolve({ data: [{ id: "brand-1" }], error: null }),
      maybeSingle: () => Promise.resolve({ data: stored, error: null }),
      upsert: () => {
        writes.push(table);
        return Promise.resolve({ error: null });
      },
    };
    return q;
  };
  return { client: { from } as unknown as ServiceClient, writes };
}

describe("Stripe's trial_will_end", () => {
  it("queues the reminder even when it arrives after a newer event", async () => {
    const d = fakeDb({
      organization_id: "org-1",
      stripe_subscription_id: "sub_1",
      stripe_event_at: "2026-12-21T11:00:00.000Z",
    });
    const event = {
      id: "evt_1",
      type: "customer.subscription.trial_will_end",
      created: Date.parse("2026-12-21T10:00:00Z") / 1000,
      data: { object: sub },
    } as unknown as Stripe.Event;
    expect(await applyStripeEvent(d.client, event)).toBe(
      "ignored: older than the stored subscription",
    );
    expect(queueTrialReminder).toHaveBeenCalledWith(d.client, "org-1", sub);
    // The stored bill isn't overwritten by the older event.
    expect(d.writes).toEqual([]);
    expect(writeAudit).toHaveBeenCalledWith(
      d.client,
      expect.objectContaining({ action: "billing.trial_reminder_queued" }),
    );
  });
});
