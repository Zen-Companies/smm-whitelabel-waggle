import type { ServiceClient } from "@/lib/supabase/service";

/**
 * The conversation a DM belongs to, created the first time it's seen, with the 24-hour reply
 * window (§7.4) moved forward to `customerMessageAt` when that is newer. Used by the DM webhook
 * and by the first-connect catch-up. A conversation id already owned by another tenant is refused.
 */
export async function recordConversation(
  db: ServiceClient,
  input: {
    tenantId: string;
    socialAccountId: string;
    zernioConversationId: string;
    platform: string;
    participantName: string | null;
    participantExternalId: string | null;
    subject?: string | null;
    zernioContactId?: string | null;
    customerMessageAt: string;
  },
): Promise<{ conversationId: string } | { foreign: true }> {
  const { error: upsertError } = await db.from("conversations").upsert(
    {
      tenant_id: input.tenantId,
      social_account_id: input.socialAccountId,
      zernio_conversation_id: input.zernioConversationId,
      platform: input.platform,
      participant_name: input.participantName,
      participant_external_id: input.participantExternalId,
      subject: input.subject ?? null,
    },
    { onConflict: "zernio_conversation_id", ignoreDuplicates: true },
  );
  if (upsertError) throw new Error(`conversations upsert failed: ${upsertError.message}`);

  const { data: conversation, error: lookupError } = await db
    .from("conversations")
    .select("id, tenant_id")
    .eq("zernio_conversation_id", input.zernioConversationId)
    .single();
  if (lookupError) throw new Error(`conversations lookup failed: ${lookupError.message}`);
  if (conversation.tenant_id !== input.tenantId) return { foreign: true };

  // The person's Zernio contact, for follow-ups to quiet leads (18 Nov).
  if (input.zernioContactId) {
    const { error: contactError } = await db
      .from("conversations")
      .update({ zernio_contact_id: input.zernioContactId })
      .eq("id", conversation.id);
    if (contactError)
      throw new Error(`conversation contact update failed: ${contactError.message}`);
  }

  // The 24-hour reply window (§7.4) runs from the latest customer message.
  const { error: windowError } = await db
    .from("conversations")
    .update({ last_customer_message_at: input.customerMessageAt })
    .eq("id", conversation.id)
    .or(
      `last_customer_message_at.is.null,last_customer_message_at.lt."${input.customerMessageAt}"`,
    );
  if (windowError) throw new Error(`conversation window update failed: ${windowError.message}`);
  return { conversationId: conversation.id };
}
