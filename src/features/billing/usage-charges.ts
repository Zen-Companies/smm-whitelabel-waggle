import "server-only";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import type { SocialProvider } from "@/lib/social/types";
import type { getServiceClient } from "@/lib/supabase/service";
import { auditOrg } from "./billing-store";
import { usageLineText, usageParts, usageWindow, type UsagePart } from "./usage-at-cost";

type ServiceClient = ReturnType<typeof getServiceClient>;

const iso = (s: number) => new Date(s * 1000).toISOString();

/**
 * From the Stripe webhook (database only, rule 3): a renewal invoice in draft, or a trial that
 * ended without one, gets a row; the jobs route adds the usage at cost. Returns what it did.
 */
export async function queueUsageCharge(
  db: ServiceClient,
  orgId: string,
  input:
    | { kind: "invoice"; invoiceId: string; start: number; end: number }
    | { kind: "trial_end"; start: number; end: number },
): Promise<string> {
  const { error } = await db.from("usage_charges").upsert(
    {
      organization_id: orgId,
      kind: input.kind,
      stripe_invoice_id: input.kind === "invoice" ? input.invoiceId : null,
      period_start: iso(input.start),
      period_end: iso(input.end),
    },
    { onConflict: "organization_id,kind,period_start", ignoreDuplicates: true },
  );
  if (error) throw new Error(`billing: queueing usage at cost failed: ${error.message}`);
  return `usage at cost queued (${input.kind})`;
}

interface BusinessUsage {
  tenantId: string;
  name: string;
  cents: number;
  parts: UsagePart[];
}

/** Each business's pay-per-use for the window, from Zernio; businesses with none are left out. */
async function usageFor(
  db: ServiceClient,
  social: SocialProvider,
  orgId: string,
  start: Date,
  end: Date,
): Promise<BusinessUsage[]> {
  const { data: tenants, error } = await db
    .from("tenants")
    .select("id, name, zernio_profile_id")
    .eq("organization_id", orgId)
    .not("zernio_profile_id", "is", null);
  if (error) throw new Error(`billing: reading the businesses failed: ${error.message}`);
  const window = usageWindow(start, end);
  const out: BusinessUsage[] = [];
  for (const t of tenants ?? []) {
    const totals = await social.getUsageCost({
      profileId: t.zernio_profile_id!,
      ...window,
      signal: AbortSignal.timeout(15_000),
    });
    const { cents, parts } = usageParts(totals);
    if (cents > 0) out.push({ tenantId: t.id, name: t.name, cents, parts });
  }
  return out;
}

/**
 * The jobs route: adds each queued organization's usage at cost. Renewals get one line per
 * business on the invoice Stripe is about to charge (same billing cycle); a trial cancelled before
 * its first invoice gets its own invoice, charged to the card on file. Idempotent per row and
 * business, so a retried run never adds a line twice.
 */
export async function chargeUsageAtCost(deps: {
  db: ServiceClient;
  stripe: Stripe | null;
  social: () => SocialProvider;
  shouldContinue?: () => boolean;
}): Promise<{ added: number; none: number; missed: number }> {
  const { db, stripe } = deps;
  const result = { added: 0, none: 0, missed: 0 };
  if (!stripe) return result;
  const { data: rows } = await db
    .from("usage_charges")
    .select("id, organization_id, kind, stripe_invoice_id, period_start, period_end")
    .eq("status", "pending")
    .order("created_at")
    .limit(20);
  for (const row of rows ?? []) {
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    const done = async (
      status: "added" | "none" | "missed" | "failed",
      extra: { amount_cents?: number; lines?: BusinessUsage[] } = {},
    ) => {
      await db
        .from("usage_charges")
        .update({
          status,
          amount_cents: extra.amount_cents ?? 0,
          lines: (extra.lines ?? []) as unknown as never,
          done_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    };
    try {
      const { data: bill } = await db
        .from("org_billing")
        .select("stripe_customer_id")
        .eq("organization_id", row.organization_id)
        .maybeSingle();
      if (!bill) {
        await done("none");
        result.none++;
        continue;
      }
      const start = new Date(row.period_start);
      const end = new Date(row.period_end);
      const usage = await usageFor(db, deps.social(), row.organization_id, start, end);
      const total = usage.reduce((n, u) => n + u.cents, 0);
      if (!total) {
        await done("none");
        result.none++;
        continue;
      }
      let invoiceId: string;
      if (row.kind === "invoice") {
        invoiceId = row.stripe_invoice_id!;
        const invoice = await stripe.invoices.retrieve(invoiceId);
        if (invoice.status !== "draft") {
          // Stripe finalized it before we got to it: nothing added, so nothing charged.
          Sentry.captureMessage("usage at cost missed a renewal invoice", {
            extra: { organizationId: row.organization_id, invoiceId, cents: total },
          });
          await done("missed", { amount_cents: total, lines: usage });
          result.missed++;
          continue;
        }
      } else {
        const invoice = await stripe.invoices.create(
          {
            customer: bill.stripe_customer_id,
            collection_method: "charge_automatically",
            auto_advance: false,
            pending_invoice_items_behavior: "exclude",
            description: "Usage at cost during your free trial",
            metadata: { kind: "usage_at_cost", organization_id: row.organization_id },
          },
          { idempotencyKey: `usage-invoice:${row.id}` },
        );
        invoiceId = invoice.id!;
      }
      for (const u of usage) {
        await stripe.invoiceItems.create(
          {
            customer: bill.stripe_customer_id,
            invoice: invoiceId,
            amount: u.cents,
            currency: "usd",
            description: usageLineText(u.name, start, new Date(end.getTime() - 1), u.parts),
            metadata: { kind: "usage_at_cost", tenant_id: u.tenantId },
          },
          { idempotencyKey: `usage-item:${row.id}:${u.tenantId}` },
        );
      }
      if (row.kind === "trial_end") {
        const finalized = await stripe.invoices.finalizeInvoice(invoiceId);
        if (finalized.status === "open") {
          await stripe.invoices.pay(invoiceId).catch((e: unknown) => {
            // A decline leaves the invoice open: Stripe's own retries and emails take over.
            Sentry.captureException(e, { extra: { organizationId: row.organization_id } });
          });
        }
      }
      await done("added", { amount_cents: total, lines: usage });
      await auditOrg(db, row.organization_id, "billing.usage_at_cost", "system", {
        kind: row.kind,
        invoice: invoiceId,
        cents: total,
        businesses: usage.length,
      });
      result.added++;
    } catch (error) {
      // Left pending: the next run tries again (the idempotency keys keep lines single).
      Sentry.captureException(error, {
        extra: {
          organizationId: row.organization_id,
          usageChargeId: row.id,
          step: "usage-at-cost",
        },
      });
      if (
        Date.now() - new Date(row.period_end).getTime() > 2 * 60 * 60_000 &&
        row.kind === "invoice"
      ) {
        await done("failed");
      }
    }
  }
  return result;
}
