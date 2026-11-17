import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { applyStripeEvent } from "@/features/billing/billing-store";
import { chargeUsageAtCost } from "@/features/billing/usage-charges";
import { MockSocialProvider } from "@/lib/social/mock";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// Usage at cost (design "Every Zernio platform", approved 18 Nov): a renewal invoice in draft
// gets one line per business with its pay-per-use, once; a finalized invoice gets nothing.
// Zernio is the mock (X $3.40, texts $1.10 per profile); Stripe is a recording fake.
const db = serviceClient();
const social = new MockSocialProvider();
const userIds: string[] = [];
const tenantIds: string[] = [];
let orgId: string;
const customer = `cus_test_${Date.now()}`;

type Item = { invoice: string; amount: number; description: string; key: string };

function fakeStripe(status: "draft" | "open") {
  const items: Item[] = [];
  const seen = new Set<string>();
  const stripe = {
    invoices: {
      retrieve: async (id: string) => ({ id, status }),
    },
    invoiceItems: {
      create: async (
        body: { invoice: string; amount: number; description: string },
        opts: { idempotencyKey: string },
      ) => {
        if (!seen.has(opts.idempotencyKey)) {
          seen.add(opts.idempotencyKey);
          items.push({ ...body, key: opts.idempotencyKey });
        }
        return { id: `ii_${items.length}` };
      },
    },
  } as unknown as Stripe;
  return { stripe, items };
}

const invoiceCreated = (id: string, start: number, end: number) =>
  ({
    id: `evt_${id}`,
    type: "invoice.created",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id,
        customer,
        billing_reason: "subscription_cycle",
        status: "draft",
        period_start: start,
        period_end: end,
        metadata: {},
      },
    },
  }) as unknown as Stripe.Event;

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userIds.push(data.user!.id);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: data.user!.id,
    p_name: "Harbour Bean Café",
  });
  const tenantId = rows![0].tenant_id;
  tenantIds.push(tenantId);
  await db.from("tenants").update({ zernio_profile_id: "prof_usage_test" }).eq("id", tenantId);
  const { data: t } = await db
    .from("tenants")
    .select("organization_id")
    .eq("id", tenantId)
    .single();
  orgId = t!.organization_id!;
  await db.from("org_billing").upsert({ organization_id: orgId, stripe_customer_id: customer });
});

afterAll(async () => {
  await db.from("usage_charges").delete().eq("organization_id", orgId);
  await db.from("org_billing").delete().eq("organization_id", orgId);
  for (const id of tenantIds) await db.from("tenants").delete().eq("id", id);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("usage at cost on the renewal invoice", () => {
  it("queues the draft renewal, adds one line per business once, at cost", async () => {
    const start = Math.floor(Date.UTC(2026, 10, 12) / 1000);
    const end = Math.floor(Date.UTC(2026, 11, 12) / 1000);
    const said = await applyStripeEvent(db, invoiceCreated("in_usage_1", start, end));
    expect(said).toContain("queued");
    // A retried webhook queues nothing new.
    await applyStripeEvent(db, invoiceCreated("in_usage_1", start, end));

    const { stripe, items } = fakeStripe("draft");
    const r1 = await chargeUsageAtCost({ db, stripe, social: () => social });
    expect(r1.added).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ invoice: "in_usage_1", amount: 450 });
    expect(items[0]!.description).toBe(
      "Usage at cost, Harbour Bean Café, Nov 12 – Dec 11: X $3.40, texts $1.10",
    );

    const r2 = await chargeUsageAtCost({ db, stripe, social: () => social });
    expect(r2.added).toBe(0);
    expect(items).toHaveLength(1);
    const { data: row } = await db
      .from("usage_charges")
      .select("status, amount_cents")
      .eq("stripe_invoice_id", "in_usage_1")
      .single();
    expect(row).toEqual({ status: "added", amount_cents: 450 });
  });

  it("an invoice Stripe already finalized gets nothing (never charged twice or late)", async () => {
    const start = Math.floor(Date.UTC(2026, 11, 12) / 1000);
    const end = Math.floor(Date.UTC(2027, 0, 12) / 1000);
    await applyStripeEvent(db, invoiceCreated("in_usage_2", start, end));
    const { stripe, items } = fakeStripe("open");
    const r = await chargeUsageAtCost({ db, stripe, social: () => social });
    expect(r.missed).toBe(1);
    expect(items).toHaveLength(0);
  });

  it("ignores invoices that aren't renewals", async () => {
    const event = invoiceCreated("in_usage_3", 1, 2);
    (event.data.object as { billing_reason: string }).billing_reason = "subscription_create";
    expect(await applyStripeEvent(db, event)).toBe("ignored");
  });
});
