"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import type { AdLeadStatus } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";
import { leadConsented, leadContact, parseLeadForm, toLeadFormBody } from "./lead-form";

export type LeadFormState = { error?: string; field?: string; savedAt?: number; done?: string };

const STATUSES: AdLeadStatus[] = ["new", "contacted", "unreachable", "qualified", "converted", "disqualified"];

/** The brand's Facebook Page accounts (lead forms live on the Page; Instagram ads use them too). */
async function pageAccounts(tenantId: string): Promise<string[]> {
  const { data } = await getServiceClient()
    .from("social_accounts")
    .select("zernio_account_id")
    .eq("tenant_id", tenantId)
    .eq("platform", "facebook")
    .eq("status", "active");
  return (data ?? []).map((a) => a.zernio_account_id);
}

/** Create a lead form (T78c). It shows in ads on the brand's behalf: owner/admin only. */
export async function createLeadFormAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const parsed = parseLeadForm(formData);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };
  if (!(await pageAccounts(tenant.id)).includes(parsed.value.accountId)) {
    return { error: "Pick this brand's Facebook Page.", field: "accountId" };
  }
  try {
    // Not idempotent upstream (Zernio's docs): one attempt, never retried.
    await getSocialProvider().createLeadForm({
      body: toLeadFormBody(parsed.value, tenant.name),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "createLeadForm" } });
    return {
      error:
        "Meta didn't create the form. If it's the first one, your Page may need to accept Meta's lead ads terms first (Meta Business Suite → Lead ads).",
    };
  }
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "lead_form_created",
    actor: tenant.userId,
    details: { questions: parsed.value.questions.length + parsed.value.custom.length },
  });
  revalidatePath("/contacts/ad-leads");
  return { savedAt: Date.now() };
}

/** Find a lead among this brand's own leads (Zernio ids aren't brand-scoped). */
async function ownLead(tenantId: string, id: string) {
  const accounts = await pageAccounts(tenantId);
  if (!accounts.length) return null;
  const leads = await getSocialProvider().listAdLeads({ accountIds: accounts, signal: AbortSignal.timeout(15_000) });
  return leads.find((l) => l.id === id) ?? null;
}

/** Move a lead along: contacted, qualified, won, not a fit… */
export async function setLeadStatus(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as AdLeadStatus;
  if (!id || !STATUSES.includes(status)) return { error: "Something went wrong. Reload the page." };
  try {
    if (!(await ownLead(tenant.id, id))) return { error: "Something went wrong. Reload the page." };
    await getSocialProvider().updateAdLeadStatus({ id, status, signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "setLeadStatus" } });
    return { error: "Couldn't change it right now. Try again." };
  }
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "ad_lead_status",
    actor: tenant.userId,
    details: { leadId: id, status },
  });
  revalidatePath("/contacts/ad-leads");
  return { savedAt: Date.now() };
}

/**
 * Add a lead to Contacts, tagged "lead". They get messages (broadcasts, sequences) only if they
 * ticked the form's messages box; their phone goes on the brand's WhatsApp number.
 */
export async function addLeadToContacts(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  if (!tenant.zernioProfileId) return { error: "Connect an account first." };
  const id = String(formData.get("id") ?? "");
  try {
    const lead = id ? await ownLead(tenant.id, id) : null;
    if (!lead) return { error: "Something went wrong. Reload the page." };
    const person = leadContact(lead.fields);
    const consent = leadConsented(lead.consents);
    const { data: wa } = await getServiceClient()
      .from("social_accounts")
      .select("zernio_account_id")
      .eq("tenant_id", tenant.id)
      .eq("platform", "whatsapp")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    await getSocialProvider().createContact({
      profileId: tenant.zernioProfileId,
      name: person.name,
      email: person.email,
      tags: ["lead"],
      subscribed: consent,
      ...(wa && person.phone
        ? { channel: { accountId: wa.zernio_account_id, platform: "whatsapp", identifier: person.phone } }
        : {}),
      signal: AbortSignal.timeout(15_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "ad_lead_to_contact",
      actor: tenant.userId,
      details: { leadId: id, subscribed: consent, whatsapp: !!(wa && person.phone) },
    });
    revalidatePath("/contacts/ad-leads");
    return {
      savedAt: Date.now(),
      done: consent
        ? "Added to Contacts. They agreed to messages, so broadcasts and sequences can reach them."
        : "Added to Contacts. They didn't tick the messages box, so they won't get broadcasts.",
    };
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "addLeadToContacts" } });
    return { error: "Couldn't add them right now. Try again." };
  }
}
