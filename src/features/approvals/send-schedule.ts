import type { ServiceClient } from "@/lib/supabase/service";
import {
  nextSendSlot,
  SEND_SPACING_MS,
  sendingProgress,
  SENDING_ROUND_GAP_MS,
  type SendingProgress,
} from "./send-spacing";

// Spaced-out sending, the database half (send-spacing.ts has the rules). Ids and times only.

/** Bookings further out than this can't collide with a new one (they'd be past it anyway). */
const LOOKAHEAD_MS = 60 * 60_000;

/**
 * Books an approved reply's send: next_run_at at the first slot from `earliest` (the end of the
 * undo window) that keeps SEND_SPACING_MS from every other reply booked or sent on the same
 * social account. Only touches an item that is `sending`.
 */
export async function bookSendSlot(
  db: ServiceClient,
  input: {
    itemId: string;
    socialAccountId: string;
    earliest: Date;
    spacingMs?: number;
  },
): Promise<Date> {
  const spacingMs = input.spacingMs ?? SEND_SPACING_MS;
  // If the bookings can't be read, the end of the undo window still holds: the send step checks
  // the spacing again before anything goes out.
  const taken =
    spacingMs > 0
      ? await bookedOnAccount(
          db,
          input.socialAccountId,
          input.itemId,
          input.earliest,
          spacingMs,
        ).catch(() => [])
      : [];
  const slot = new Date(nextSendSlot(input.earliest.getTime(), taken, spacingMs));
  const { error } = await db
    .from("inbound_items")
    .update({ next_run_at: slot.toISOString() })
    .eq("id", input.itemId)
    .eq("status", "sending");
  if (error) throw new Error(`booking the send failed: ${error.message}`);
  return slot;
}

/** Send times near `around` on the account: other replies booked, attempted or sent. */
async function bookedOnAccount(
  db: ServiceClient,
  socialAccountId: string,
  exceptItemId: string,
  around: Date,
  spacingMs: number,
): Promise<number[]> {
  const from = new Date(around.getTime() - LOOKAHEAD_MS).toISOString();
  const to = new Date(around.getTime() + LOOKAHEAD_MS).toISOString();
  const [{ data: booked, error: e1 }, last] = await Promise.all([
    db
      .from("inbound_items")
      .select("next_run_at")
      .eq("social_account_id", socialAccountId)
      .eq("status", "sending")
      .neq("id", exceptItemId)
      .gte("next_run_at", from)
      .lte("next_run_at", to),
    lastSendOnAccount(db, {
      socialAccountId,
      exceptItemId,
      since: new Date(around.getTime() - spacingMs),
    }),
  ]);
  if (e1) throw new Error(`reading booked sends failed: ${e1.message}`);
  const times = (booked ?? []).flatMap((r) => (r.next_run_at ? [Date.parse(r.next_run_at)] : []));
  return last ? [...times, last.getTime()] : times;
}

/**
 * The account's latest reply that went out (or started going out) since `since`, other than
 * this item's: drafts.sent_at, or send_attempted_at while an attempt is in flight.
 */
export async function lastSendOnAccount(
  db: ServiceClient,
  input: { socialAccountId: string; exceptItemId: string; since: Date },
): Promise<Date | null> {
  const since = input.since.toISOString();
  const { data, error } = await db
    .from("drafts")
    .select("sent_at, send_attempted_at, inbound_items!inner (social_account_id)")
    .eq("inbound_items.social_account_id", input.socialAccountId)
    .neq("item_id", input.exceptItemId)
    .or(`sent_at.gte.${since},send_attempted_at.gte.${since}`);
  if (error) throw new Error(`reading the account's last send failed: ${error.message}`);
  let latest: number | null = null;
  for (const row of data ?? []) {
    for (const t of [row.sent_at, row.send_attempted_at]) {
      if (!t) continue;
      const ms = Date.parse(t);
      if (latest === null || ms > latest) latest = ms;
    }
  }
  return latest === null ? null : new Date(latest);
}

/**
 * "Sending N of M…" for a brand: replies the owner approved recently that are sent or still
 * waiting their turn. Null when there's nothing to show.
 */
export async function loadSendingProgress(
  db: ServiceClient,
  tenantId: string,
  now: Date = new Date(),
): Promise<SendingProgress | null> {
  const since = new Date(now.getTime() - 3 * SENDING_ROUND_GAP_MS).toISOString();
  const { data, error } = await db
    .from("drafts")
    .select("decided_at, status, inbound_items!inner (status)")
    .eq("tenant_id", tenantId)
    .not("decided_by", "is", null)
    .in("status", ["approved", "sent"])
    .gte("decided_at", since)
    .limit(500);
  if (error) throw new Error(`reading replies being sent failed: ${error.message}`);
  const rows = (data ?? []).flatMap((d) => {
    if (!d.decided_at) return [];
    if (d.status === "sent") return [{ decidedAt: d.decided_at, sent: true }];
    // Approved and still waiting its turn (not held back to the owner or failed).
    return d.inbound_items.status === "sending" ? [{ decidedAt: d.decided_at, sent: false }] : [];
  });
  return sendingProgress(rows);
}
