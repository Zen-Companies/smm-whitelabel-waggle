"use server";

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";

/**
 * T82b: a fresh, short-lived link to a voicemail's audio (about 10 minutes), only for this
 * brand's own call items. The link is never stored.
 */
export async function voicemailUrlAction(
  itemId: string,
): Promise<{ url?: string; error?: string }> {
  if (!z.uuid().safeParse(itemId).success) return { error: "Something went wrong. Reload." };
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  const { data: item } = await getServiceClient()
    .from("inbound_items")
    .select("zernio_call_id, call_voicemail")
    .eq("id", itemId)
    .eq("tenant_id", tenant.id)
    .eq("kind", "call")
    .maybeSingle();
  if (!item?.zernio_call_id || !item.call_voicemail) return { error: "There's no voicemail here." };
  try {
    const url = await getSocialProvider().getCallRecordingUrl({
      callId: item.zernio_call_id,
      signal: AbortSignal.timeout(15_000),
    });
    return url ? { url } : { error: "The voicemail isn't available any more." };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { tenantId: tenant.id, itemId, step: "voicemailUrl" },
    });
    return { error: "The voicemail couldn't be loaded right now. Try again." };
  }
}
