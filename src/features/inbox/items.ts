import { writeAudit } from "@/lib/audit";
import type { ServiceClient } from "@/lib/supabase/service";

export type NewInboundItem = {
  tenantId: string;
  socialAccountId: string;
  authorName: string | null;
  text: string;
  receivedAt: string;
  /** First connect (20 Nov): the catch-up that pulled it (comments and DMs only). */
  catchUpId?: string | null;
} & (
  | {
      kind: "comment";
      zernioCommentId: string;
      zernioPostId: string;
      permalink?: string | null;
      /** First connect: the post's caption, for the reveal's labels and top questions. */
      postCaption?: string | null;
    }
  | {
      kind: "dm";
      zernioMessageId: string;
      conversationId: string;
      /** T72: the platform's message id and what it carried besides text (kinds only). */
      platformMessageId?: string | null;
      attachments?: { type: string; originalType?: string }[];
    }
  /** T42: a Facebook Page review (polled); T61: a Google review (webhook), with its stars. */
  | {
      kind: "review";
      zernioReviewId: string;
      recommends: boolean | null;
      rating?: number | null;
      permalink?: string | null;
    }
  /** T82b: an inbound call nobody answered, or that went to voicemail. */
  | { kind: "call"; zernioCallId: string; voicemail: boolean; durationSeconds: number }
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
  if (item.kind === "review") return insertReview(db, item, common);
  if (item.kind === "call") return insertCall(db, item, common);
  const [row, conflictColumn, zernioId] =
    item.kind === "comment"
      ? [
          {
            ...common,
            zernio_comment_id: item.zernioCommentId,
            zernio_post_id: item.zernioPostId,
            permalink: item.permalink ?? null,
            catch_up_id: item.catchUpId ?? null,
            post_caption: item.postCaption ?? null,
          },
          "zernio_comment_id" as const,
          item.zernioCommentId,
        ]
      : [
          {
            ...common,
            zernio_message_id: item.zernioMessageId,
            conversation_id: item.conversationId,
            platform_message_id: item.platformMessageId ?? null,
            attachments: item.attachments ?? [],
            catch_up_id: item.catchUpId ?? null,
          },
          "zernio_message_id" as const,
          item.zernioMessageId,
        ];

  // A DM pulled at first connect is keyed by Meta's id, a webhook DM by Zernio's: both carry
  // Meta's id as platform_message_id (unique per account), so either way round it's one item.
  const platformMessageId = item.kind === "dm" ? (item.platformMessageId ?? null) : null;
  const samePlatformMessage = async () => {
    if (!platformMessageId) return null;
    const { data, error: findError } = await db
      .from("inbound_items")
      .select("id")
      .eq("social_account_id", item.socialAccountId)
      .eq("platform_message_id", platformMessageId)
      .maybeSingle();
    if (findError) throw new Error(`inbound_items lookup failed: ${findError.message}`);
    return data;
  };
  const known = await samePlatformMessage();
  if (known) return { itemId: known.id, created: false };

  const { data: inserted, error } = await db
    .from("inbound_items")
    .upsert(row, { onConflict: conflictColumn, ignoreDuplicates: true })
    .select("id");
  if (error) {
    // The other copy landed between the lookup and the insert.
    const raced = error.code === "23505" ? await samePlatformMessage() : null;
    if (raced) return { itemId: raced.id, created: false };
    throw new Error(`inbound_items insert failed: ${error.message}`);
  }

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

async function insertReview(
  db: ServiceClient,
  item: Extract<NewInboundItem, { kind: "review" }>,
  common: Record<string, string | null>,
): Promise<{ itemId: string; created: boolean }> {
  const { data: inserted, error } = await db
    .from("inbound_items")
    .upsert(
      {
        ...(common as {
          tenant_id: string;
          social_account_id: string;
          kind: string;
          text: string;
          received_at: string;
        }),
        zernio_review_id: item.zernioReviewId,
        review_recommends: item.recommends,
        review_rating: item.rating ?? null,
        permalink: item.permalink ?? null,
      },
      { onConflict: "social_account_id,zernio_review_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`inbound_items review insert failed: ${error.message}`);
  if (inserted.length > 0) {
    const itemId = inserted[0].id;
    await writeAudit(db, {
      tenantId: item.tenantId,
      itemId,
      action: "item_received",
      actor: "system",
      details: { kind: "review", socialAccountId: item.socialAccountId },
    });
    return { itemId, created: true };
  }
  const { data: existing, error: lookupError } = await db
    .from("inbound_items")
    .select("id")
    .eq("social_account_id", item.socialAccountId)
    .eq("zernio_review_id", item.zernioReviewId)
    .single();
  if (lookupError) throw new Error(`inbound_items review lookup failed: ${lookupError.message}`);
  return { itemId: existing.id, created: false };
}

async function insertCall(
  db: ServiceClient,
  item: Extract<NewInboundItem, { kind: "call" }>,
  common: Record<string, string | null>,
): Promise<{ itemId: string; created: boolean }> {
  const { data: inserted, error } = await db
    .from("inbound_items")
    .upsert(
      {
        ...(common as {
          tenant_id: string;
          social_account_id: string;
          kind: string;
          text: string;
          received_at: string;
        }),
        zernio_call_id: item.zernioCallId,
        call_voicemail: item.voicemail,
        call_duration_seconds: item.durationSeconds,
      },
      { onConflict: "zernio_call_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`inbound_items insert failed: ${error.message}`);
  if (inserted.length > 0) {
    const itemId = inserted[0].id;
    await writeAudit(db, {
      tenantId: item.tenantId,
      itemId,
      action: "item_received",
      actor: "system",
      details: { kind: "call", socialAccountId: item.socialAccountId, voicemail: item.voicemail },
    });
    return { itemId, created: true };
  }
  const { data: existing, error: lookupError } = await db
    .from("inbound_items")
    .select("id")
    .eq("zernio_call_id", item.zernioCallId)
    .single();
  if (lookupError) throw new Error(`inbound_items lookup failed: ${lookupError.message}`);
  return { itemId: existing.id, created: false };
}
