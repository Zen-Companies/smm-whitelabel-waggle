"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";
import { parseBroadcastForm } from "./broadcast";

export type BroadcastFormState = {
  error?: string;
  field?: string;
  savedAt?: number;
  /** Set when nothing was sent because nobody matched. */
  empty?: boolean;
  recipients?: number;
  scheduled?: boolean;
};

const UNAVAILABLE = "The broadcast couldn't be sent right now. Nothing went out. Try again in a moment.";

/**
 * Send (or schedule) a WhatsApp broadcast (T78b). It messages many people at once on the
 * brand's behalf, so only owners and admins can.
 */
export async function sendBroadcast(
  _prev: BroadcastFormState,
  formData: FormData,
): Promise<BroadcastFormState> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  if (!tenant.zernioProfileId) return { error: "Connect WhatsApp first." };
  const parsed = parseBroadcastForm(formData, new Date());
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };
  const db = getServiceClient();
  const { data: account } = await db
    .from("social_accounts")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("platform", "whatsapp")
    .eq("zernio_account_id", parsed.value.accountId)
    .eq("status", "active")
    .maybeSingle();
  if (!account) return { error: "Pick this brand's WhatsApp number.", field: "accountId" };

  const social = getSocialProvider();
  let id: string;
  let recipients: number;
  try {
    ({ id, recipients } = await social.createWhatsAppBroadcast({
      profileId: tenant.zernioProfileId,
      accountId: parsed.value.accountId,
      name: parsed.value.name,
      template: {
        name: parsed.value.template.name,
        language: parsed.value.template.language,
        nameVariable: parsed.value.template.variables === 1,
      },
      tag: parsed.value.tag,
      signal: AbortSignal.timeout(30_000),
    }));
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "createBroadcast" } });
    return { error: UNAVAILABLE };
  }
  if (recipients === 0) {
    // Nobody to send to: leave the empty draft out of the way.
    await social.cancelBroadcast({ id, signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
    return {
      empty: true,
      field: "tag",
      error: parsed.value.tag
        ? `No one tagged “${parsed.value.tag}” has agreed to messages on WhatsApp.`
        : "No one has agreed to messages on WhatsApp yet.",
    };
  }
  try {
    await social.startBroadcast({ id, at: parsed.value.scheduledAt, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "startBroadcast" } });
    return { error: UNAVAILABLE };
  }
  await writeAudit(db, {
    tenantId: tenant.id,
    action: parsed.value.scheduledAt ? "broadcast_scheduled" : "broadcast_sent",
    actor: tenant.userId,
    details: { broadcastId: id, recipients, template: parsed.value.template.name, tag: parsed.value.tag },
  });
  revalidatePath("/contacts/broadcasts");
  return { savedAt: Date.now(), recipients, scheduled: !!parsed.value.scheduledAt };
}

/** Cancel a scheduled broadcast. */
export async function cancelBroadcast(
  _prev: BroadcastFormState,
  formData: FormData,
): Promise<BroadcastFormState> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const id = String(formData.get("id") ?? "");
  if (!id || !tenant.zernioProfileId) return { error: "Something went wrong. Reload the page." };
  const social = getSocialProvider();
  try {
    const list = await social.listBroadcasts({ profileId: tenant.zernioProfileId, signal: AbortSignal.timeout(10_000) });
    const b = list.find((x) => x.id === id);
    if (!b || b.status !== "scheduled") return { error: "Only a scheduled broadcast can be cancelled." };
    await social.cancelBroadcast({ id, signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "cancelBroadcast" } });
    return { error: "Couldn't cancel it right now. Try again." };
  }
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "broadcast_cancelled",
    actor: tenant.userId,
    details: { broadcastId: id },
  });
  revalidatePath("/contacts/broadcasts");
  return { savedAt: Date.now() };
}
