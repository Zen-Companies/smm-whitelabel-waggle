"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";
import { parseContactForm, parseImport, tagsFrom } from "./contact-form";

export type ContactFormState = {
  error?: string;
  field?: string;
  savedAt?: number;
  imported?: { created: number; skipped: number };
};

const UNAVAILABLE = "That couldn't be saved right now. Try again in a moment.";

/** The brand's connected WhatsApp number, where phone contacts can be messaged. */
async function whatsappAccountId(tenantId: string): Promise<string | null> {
  const { data } = await getServiceClient()
    .from("social_accounts")
    .select("zernio_account_id")
    .eq("tenant_id", tenantId)
    .eq("platform", "whatsapp")
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data?.zernio_account_id ?? null;
}

/** Add one contact (T78a). People who reply to the business are added by Zernio on their own. */
export async function addContact(_prev: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  if (!tenant.zernioProfileId) return { error: "Connect an account first." };
  const parsed = parseContactForm(formData);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };
  const wa = parsed.value.phone ? await whatsappAccountId(tenant.id) : null;
  try {
    await getSocialProvider().createContact({
      profileId: tenant.zernioProfileId,
      name: parsed.value.name,
      email: parsed.value.email,
      tags: parsed.value.tags,
      subscribed: parsed.value.subscribed,
      ...(wa && parsed.value.phone
        ? { channel: { accountId: wa, platform: "whatsapp", identifier: parsed.value.phone } }
        : {}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "addContact" } });
    return { error: UNAVAILABLE };
  }
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "contact_added",
    actor: tenant.userId,
    // Never the person's details (rule 10): only what kind of contact it is.
    details: { subscribed: parsed.value.subscribed, whatsapp: !!wa, tags: parsed.value.tags.length },
  });
  revalidatePath("/contacts");
  return { savedAt: Date.now() };
}

/**
 * Import a CSV (T78a, up to 1,000). Numbers go on the brand's WhatsApp number when it has one.
 * Imported people are added unsubscribed: only the owner's tick says they agreed to messages.
 */
export async function importContacts(
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  if (!tenant.zernioProfileId) return { error: "Connect an account first." };
  const file = formData.get("file");
  const text =
    file instanceof File && file.size > 0
      ? file.size > 2_000_000
        ? null
        : await file.text()
      : String(formData.get("csv") ?? "");
  if (text === null) return { error: "That file is too big. Split it into files of up to 1,000 people." };
  const { rows, skipped, tooMany } = parseImport(text, String(formData.get("countryCode") ?? "").replace(/\D/g, ""));
  if (!rows.length) {
    return { error: "No one to add. The first row must name the columns: name, phone (and email, tags)." };
  }
  const extraTags = tagsFrom(String(formData.get("tags") ?? ""));
  const consent = formData.get("consent") === "yes";
  const wa = await whatsappAccountId(tenant.id);
  let result: { created: number; skipped: number; errors: number };
  try {
    const social = getSocialProvider();
    result = await social.importContacts({
      profileId: tenant.zernioProfileId,
      ...(wa ? { accountId: wa } : {}),
      rows: rows.map((r) => ({
        name: r.name,
        identifier: r.phone,
        email: r.email,
        tags: [...new Set([...r.tags, ...extraTags, ...(consent ? [] : ["not-subscribed"])])],
      })),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "importContacts" } });
    return { error: UNAVAILABLE };
  }
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "contacts_imported",
    actor: tenant.userId,
    details: { rows: rows.length, created: result.created, skipped: result.skipped + skipped, consent, tooMany },
  });
  revalidatePath("/contacts");
  return {
    savedAt: Date.now(),
    imported: { created: result.created, skipped: result.skipped + result.errors + skipped },
    ...(tooMany ? { error: "Only the first 1,000 were added. Import the rest in another file." } : {}),
  };
}

/** Change whether a contact agreed to get messages, or their tags. */
export async function updateContact(
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  const id = String(formData.get("id") ?? "");
  if (!id || !tenant.zernioProfileId) return { error: "Something went wrong. Reload the page." };
  const subscribed = formData.has("subscribed") ? formData.get("subscribed") === "yes" : undefined;
  const tags = formData.has("tags") ? tagsFrom(String(formData.get("tags") ?? "")) : undefined;
  const social = getSocialProvider();
  try {
    // Zernio ids aren't brand-scoped: only change someone found under this brand's profile.
    const name = String(formData.get("name") ?? "");
    const { contacts } = await social.listContacts({
      profileId: tenant.zernioProfileId,
      search: name || undefined,
      signal: AbortSignal.timeout(10_000),
    });
    if (!contacts.some((c) => c.id === id)) return { error: "Something went wrong. Reload the page." };
    await social.updateContact({ id, tags, subscribed, signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "updateContact" } });
    return { error: UNAVAILABLE };
  }
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "contact_updated",
    actor: tenant.userId,
    details: { contactId: id, ...(subscribed !== undefined ? { subscribed } : {}), ...(tags ? { tags: tags.length } : {}) },
  });
  revalidatePath("/contacts");
  return { savedAt: Date.now() };
}
