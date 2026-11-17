import "server-only";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { getCurrentTenant } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import { createServerSupabase } from "@/lib/supabase/server";
import { parseAttachments, previewIndex } from "./attachments";

const input = z.object({ itemId: z.uuid(), index: z.coerce.number().int().min(0).max(19) });

/**
 * T72: a fresh link to a photo a customer sent, for the inbox preview. The item is read through
 * RLS in the open brand, so nobody can preview another brand's media; only the photo the inbox
 * offers to preview can be fetched. Null when there's nothing to show.
 */
export async function attachmentPreviewUrl(raw: {
  itemId: string;
  index: string;
}): Promise<string | null> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return null;
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("inbound_items")
    .select(
      "attachments, platform_message_id, social_accounts (platform, zernio_account_id), conversations (zernio_conversation_id)",
    )
    .eq("tenant_id", tenant.id)
    .eq("id", parsed.data.itemId)
    .maybeSingle();
  const row = data as unknown as {
    attachments: unknown;
    platform_message_id: string | null;
    social_accounts: { platform: string; zernio_account_id: string } | null;
    conversations: { zernio_conversation_id: string } | null;
  } | null;
  if (!row?.platform_message_id || !row.social_accounts || !row.conversations) return null;
  const at = previewIndex(row.social_accounts.platform, parseAttachments(row.attachments));
  if (at !== parsed.data.index) return null;
  try {
    return await getSocialProvider().getMessageAttachmentUrl({
      accountId: row.social_accounts.zernio_account_id,
      conversationId: row.conversations.zernio_conversation_id,
      platformMessageId: row.platform_message_id,
      index: at,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    // Rule 10: ids only.
    Sentry.captureException(error, { extra: { itemId: parsed.data.itemId, step: "attachment" } });
    return null;
  }
}
