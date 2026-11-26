import "server-only";
import type { ServiceClient } from "@/lib/supabase/service";
import { openDmsFrom, type OpenDm } from "./dm-countdown";

// The open DMs behind the DM countdown (Playbook round 2, 26 Nov): DMs in the Inbox's "need you"
// statuses whose reply window is still open. Ids and times only; message text is never read.

/** The longest DM window there is (TikTok, 48 h), with an hour to spare. */
const LOOK_BACK_MS = 49 * 3_600_000;
const ROWS_MAX = 300;

export async function loadOpenDms(
  db: ServiceClient,
  tenantId: string,
  needsYou: readonly string[],
  now: Date,
): Promise<OpenDm[]> {
  if (needsYou.length === 0) return [];
  const since = new Date(now.getTime() - LOOK_BACK_MS).toISOString();
  const { data, error } = await db
    .from("inbound_items")
    .select(
      "conversation_id, social_accounts (platform), conversations!inner (last_customer_message_at)",
    )
    .eq("tenant_id", tenantId)
    .eq("kind", "dm")
    .in("status", [...needsYou])
    .gte("conversations.last_customer_message_at", since)
    .limit(ROWS_MAX);
  if (error) throw new Error(`open DMs lookup failed: ${error.message}`);
  const rows = (data ?? []) as unknown as {
    conversation_id: string | null;
    social_accounts: { platform: string } | null;
    conversations: { last_customer_message_at: string | null } | null;
  }[];
  return openDmsFrom(
    rows.map((r) => ({
      conversationId: r.conversation_id,
      platform: r.social_accounts?.platform ?? null,
      lastCustomerMessageAt: r.conversations?.last_customer_message_at ?? null,
    })),
    now,
  );
}
