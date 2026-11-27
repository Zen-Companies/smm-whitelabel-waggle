"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentTenant, getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";

// Inbox by sender (approved 26 Nov): opening a row records when this person last saw it ("3 new"
// counts from there), and "Move a sender to For you" takes a sender out of Updates & newsletters.

/**
 * The person opened the row `itemId` belongs to: its new-message count starts again from now.
 * Written with their own client (RLS: their own rows in their own brands). A read marker, not a
 * change to anything the business sees, so it isn't audited.
 */
export async function markConversationSeen(itemId: string): Promise<void> {
  if (!z.uuid().safeParse(itemId).success) return;
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { data: item } = await supabase
    .from("inbound_items")
    .select("group_key")
    .eq("id", itemId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!item?.group_key) return;
  await supabase.from("inbox_reads").upsert(
    {
      tenant_id: tenant.id,
      user_id: tenant.userId,
      group_key: item.group_key,
      seen_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,user_id,group_key" },
  );
}

export interface MoveSenderState {
  error?: string;
  moved?: boolean;
}

/**
 * "Not a newsletter? Move a sender to For you": the sender's mail is a customer's from now on (it
 * counts, and new messages are answered). Earlier mail stays where it is. Audited.
 */
export async function moveSenderToForYou(
  _prev: MoveSenderState,
  formData: FormData,
): Promise<MoveSenderState> {
  const parsed = z.object({ itemId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something went wrong. Please reload." };
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  const db = getServiceClient();
  const { data: item } = await db
    .from("inbound_items")
    .select("social_account_id, sender_key")
    .eq("id", parsed.data.itemId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!item?.sender_key) return { error: "This sender can't be moved. Please reload." };
  const { error } = await db.from("inbox_senders").upsert(
    {
      tenant_id: tenant.id,
      social_account_id: item.social_account_id,
      sender_key: item.sender_key,
      automated: true,
      moved_to_for_you_at: new Date().toISOString(),
      moved_by: tenant.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,social_account_id,sender_key" },
  );
  if (error) return { error: "Couldn't move it just now. Please try again." };
  await writeAudit(db, {
    tenantId: tenant.id,
    itemId: parsed.data.itemId,
    action: "sender_moved_to_for_you",
    actor: tenant.userId,
    details: { socialAccountId: item.social_account_id },
  });
  revalidatePath("/inbox", "layout");
  return { moved: true };
}
