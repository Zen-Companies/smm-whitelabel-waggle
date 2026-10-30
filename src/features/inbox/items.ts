import { writeAudit } from "@/lib/audit";
import type { ServiceClient } from "@/lib/supabase/service";

export type NewInboundItem = {
  tenantId: string;
  socialAccountId: string;
  authorName: string | null;
  text: string;
  receivedAt: string;
} & (
  | { kind: "comment"; zernioCommentId: string; zernioPostId: string; permalink?: string | null }
  | { kind: "dm"; zernioMessageId: string; conversationId: string }
);

/**
 * Stores a received comment or DM as a `new` item, once: the Zernio comment/message id is
 * unique, so a redelivered or concurrent duplicate inserts nothing (docs/prd.md F4).
 */
export async function insertInboundItem(
  db: ServiceClient,
  item: NewInboundItem,
): Promise<{ itemId: string; created: boolean }> {
  const common = {
    tenant_id: item.tenantId,
    social_account_id: item.socialAccountId,
    kind: item.kind,
    author_name: item.authorName,
    text: item.text,
    received_at: item.receivedAt,
  };
  const [row, conflictColumn, zernioId] =
    item.kind === "comment"
      ? [
          {
            ...common,
            zernio_comment_id: item.zernioCommentId,
            zernio_post_id: item.zernioPostId,
            permalink: item.permalink ?? null,
          },
          "zernio_comment_id" as const,
          item.zernioCommentId,
        ]
      : [
          {
            ...common,
            zernio_message_id: item.zernioMessageId,
            conversation_id: item.conversationId,
          },
          "zernio_message_id" as const,
          item.zernioMessageId,
        ];

  const { data: inserted, error } = await db
    .from("inbound_items")
    .upsert(row, { onConflict: conflictColumn, ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`inbound_items insert failed: ${error.message}`);

  if (inserted.length > 0) {
    const itemId = inserted[0].id;
    await writeAudit(db, {
      tenantId: item.tenantId,
      itemId,
      action: "item_received",
      actor: "system",
      details: { kind: item.kind, socialAccountId: item.socialAccountId },
    });
    return { itemId, created: true };
  }

  const { data: existing, error: lookupError } = await db
    .from("inbound_items")
    .select("id")
    .eq(conflictColumn, zernioId)
    .single();
  if (lookupError) throw new Error(`inbound_items lookup failed: ${lookupError.message}`);
  return { itemId: existing.id, created: false };
}
