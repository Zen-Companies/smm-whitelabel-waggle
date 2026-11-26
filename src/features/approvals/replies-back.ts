import { transitionItem } from "@/features/inbox";
import { writeAudit } from "@/lib/audit";
import type { ServiceClient } from "@/lib/supabase/service";
import { heldReasonFromDetails } from "./inbox-data";
import { dmWindowClosesAt } from "./policy";

// Replies back after paying (Playbook round 2, carry on for C "Keep Waggle answering with Solo",
// approved 26 Nov): the messages handed to the owner while replies were out
// (policyReason ai_cap_reached) go back to the draft step, oldest window first. The draft step
// triages again and policy() decides as always (the owner's reply mode), so nothing is sent here.
// DMs whose window has closed stay with the owner: a reply could no longer go out.

/** At most this many at once (each one is an AI reply). */
export const REPLIES_BACK_MAX = 100;
/** Spacing between them, so the job takes them oldest window first. */
const SPACING_MS = 1_000;

export interface HeldItem {
  id: string;
  kind: string;
  platform: string;
  receivedAt: string;
  lastCustomerMessageAt: string | null;
  /** Why it was handed over (the status_changed audit row's reason). */
  reason: string | null;
}

/** Pure: the items to write replies for, oldest window first. */
export function pickRepliesBack(items: readonly HeldItem[], now: Date): string[] {
  return items
    .filter((i) => i.reason === "ai_cap_reached")
    .map((i) => {
      const start = i.kind === "dm" ? (i.lastCustomerMessageAt ?? i.receivedAt) : i.receivedAt;
      const closes = i.kind === "dm" ? dmWindowClosesAt(i.platform, new Date(start)) : null;
      return { id: i.id, start: Date.parse(start), closed: !!closes && closes <= now };
    })
    .filter((i) => !i.closed)
    .sort((a, b) => a.start - b.start)
    .slice(0, REPLIES_BACK_MAX)
    .map((i) => i.id);
}

/** Sends the held messages back to the draft step; returns how many. */
export async function writeRepliesForWaiting(
  db: ServiceClient,
  input: { tenantId: string; actor: string; now?: Date },
): Promise<number> {
  const now = input.now ?? new Date();
  const { data: rows, error } = await db
    .from("inbound_items")
    .select(
      "id, kind, received_at, social_accounts (platform), conversations (last_customer_message_at)",
    )
    .eq("tenant_id", input.tenantId)
    .eq("status", "escalated")
    .order("received_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`replies back lookup failed: ${error.message}`);
  const items = (rows ?? []) as unknown as {
    id: string;
    kind: string;
    received_at: string;
    social_accounts: { platform: string } | null;
    conversations: { last_customer_message_at: string | null } | null;
  }[];
  if (items.length === 0) return 0;
  const { data: audits, error: auditError } = await db
    .from("audit_log")
    .select("item_id, details")
    .eq("tenant_id", input.tenantId)
    .eq("action", "status_changed")
    .eq("details->>to", "escalated")
    .in(
      "item_id",
      items.map((i) => i.id),
    )
    .order("created_at", { ascending: false });
  if (auditError) throw new Error(`replies back reasons failed: ${auditError.message}`);
  const reasons = new Map<string, string | null>();
  for (const a of audits ?? []) {
    if (a.item_id && !reasons.has(a.item_id))
      reasons.set(a.item_id, heldReasonFromDetails(a.details));
  }
  const ids = pickRepliesBack(
    items.map((i) => ({
      id: i.id,
      kind: i.kind,
      platform: i.social_accounts?.platform ?? "instagram",
      receivedAt: i.received_at,
      lastCustomerMessageAt: i.conversations?.last_customer_message_at ?? null,
      reason: reasons.get(i.id) ?? null,
    })),
    now,
  );
  let moved = 0;
  for (const [n, id] of ids.entries()) {
    const { applied } = await transitionItem(db, {
      itemId: id,
      from: "escalated",
      event: "redraft",
      details: { why: "replies_back" },
    });
    if (!applied) continue;
    await db
      .from("inbound_items")
      .update({ next_run_at: new Date(now.getTime() + n * SPACING_MS).toISOString() })
      .eq("id", id)
      .eq("status", "classified");
    moved += 1;
  }
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "replies_back",
    actor: input.actor,
    details: { count: moved },
  });
  return moved;
}
