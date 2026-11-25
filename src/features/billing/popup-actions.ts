"use server";

import { z } from "zod";
import { conversionEventId, matchKeys, type ConversionTagProps } from "@/features/ad-tracking";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { auditOrg } from "./billing-store";
import { loadPopupFacts } from "./popup-facts";
import { successLines } from "./promotions";
import { referrerOf } from "./referrals";
import type { PopupFacts } from "./popup-copy";
import { billingFromSubscription } from "./subscription";
import { loadCheckoutReturn } from "./trial-conversion";

// The upgrade pop-up's two server calls (pop-ups plan, approved 23 Nov): the brand's own numbers
// when it opens, and Stripe's return ("You're on Solo"), checked with Stripe before anything is
// said or tagged. Members of the organization only.

const factsInput = z.object({
  orgId: z.uuid(),
  tenantId: z.uuid().nullable(),
  needsYou: z.array(z.string().regex(/^[a-z_]{1,32}$/)).max(12),
});

async function memberOf(orgId: string) {
  const user = await getCurrentUser();
  const db = getServiceClient();
  const { data } = await db
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  return data ? { user, db, role: data.role } : null;
}

/** The numbers for the honey box and the strip, or none (the pop-up then leaves them out). */
export async function popupFacts(raw: {
  orgId: string;
  tenantId: string | null;
  needsYou: readonly string[];
}): Promise<Omit<PopupFacts, "usage"> | null> {
  const parsed = factsInput.safeParse(raw);
  if (!parsed.success) return null;
  const { orgId, tenantId, needsYou } = parsed.data;
  const who = await memberOf(orgId);
  if (!who) return null;
  const { db } = who;
  try {
    // The open brand, or (setup, no brand in the layout) the organization's first.
    const { data: brand } = tenantId
      ? await db
          .from("tenants")
          .select("id")
          .eq("id", tenantId)
          .eq("organization_id", orgId)
          .maybeSingle()
      : await db
          .from("tenants")
          .select("id")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
    if (!brand) return null;
    return await loadPopupFacts(db, { orgId, tenantId: brand.id, needsYou, now: new Date() });
  } catch (e) {
    console.error("billing: pop-up numbers failed", {
      orgId,
      error: e instanceof Error ? e.message : "unknown",
    });
    return null;
  }
}

const returnInput = z.object({
  orgId: z.uuid(),
  sessionId: z.string().regex(/^cs_(test|live)_[A-Za-z0-9]{10,200}$/),
});

/**
 * Stripe's return to the page the pop-up was on: when Stripe confirms the checkout started this
 * organization's plan, it's stored now (the webhook still has the last word) and the ads tag is
 * handed back. Anything else returns null and the pop-up says nothing changed.
 */
/** What the success moment says (approved 24 Nov): the date and the promotion lines. */
export interface CheckoutSuccess {
  tag: ConversionTagProps | null;
  /** The trial's end from Stripe (ISO), or null when it was paid straight away. */
  freeUntil: string | null;
  /** "Harbour Bean Café's month is on…", "+1 month from friends you brought…". */
  lines: string[];
}

export async function confirmCheckout(raw: {
  orgId: string;
  sessionId: string;
}): Promise<CheckoutSuccess | null> {
  const parsed = returnInput.safeParse(raw);
  if (!parsed.success) return null;
  const { orgId, sessionId } = parsed.data;
  const who = await memberOf(orgId);
  if (!who) return null;
  const back = await loadCheckoutReturn(sessionId, orgId);
  if (!back) return null;
  const { conversion, subscription, metadata } = back;
  const { db, user } = who;
  await db
    .from("org_billing")
    .update({ ...billingFromSubscription(subscription), updated_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .eq("stripe_customer_id", billingFromSubscription(subscription).stripe_customer_id);
  await auditOrg(db, orgId, "billing.checkout_returned", user.id, {
    plan: conversion.plan,
    kind: conversion.kind,
  });
  const freeUntil =
    subscription.status === "trialing" && subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null;
  const promo = metadata.promo ?? null;
  const banked = (metadata.banked_referrals ?? "").split(",").filter(Boolean).length;
  const referrer = promo?.split(",").includes("referral")
    ? await referrerOf(db, orgId).catch(() => ({ referred: true, name: null }))
    : null;
  const lines = successLines({ promo, bankedMonths: banked, referrerName: referrer?.name ?? null });
  // A plan change from the pop-up is stored too, but only a first checkout fires the ads tag.
  if (!conversion.first) return { tag: null, freeUntil, lines };
  const event = conversion.kind === "trial" ? "StartTrial" : "Subscribe";
  const keys = matchKeys(user.id, user.email);
  return {
    freeUntil,
    lines,
    tag: {
      event,
      eventId: conversionEventId(event, conversion.sessionId),
      em: keys.em,
      externalId: keys.externalId,
      valueUsd: conversion.valueUsd,
      plan: conversion.plan,
    },
  };
}
