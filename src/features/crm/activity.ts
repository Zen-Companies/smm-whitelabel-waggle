// "Last active" for the inactive / app_active emails. A visit writes at most once an hour; the
// jobs route's daily-style sweep queues `inactive` after 2 days away, and the next visit queues
// `app_active` (which stops the come-back emails).

import { CRM_INACTIVE_AFTER_DAYS, queueCrmEvent } from "@/lib/crm";
import type { ServiceClient } from "@/lib/supabase/service";

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

async function ownedOrgs(db: ServiceClient, userId: string): Promise<string[]> {
  const { data } = await db
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("role", "owner");
  return (data ?? []).map((m) => m.organization_id);
}

/** A visit. Cheap when called on every page: one read, a write at most once an hour. */
export async function touchActivity(db: ServiceClient, userId: string, now = new Date()) {
  const { data } = await db
    .from("user_activity")
    .select("last_seen_at, inactive_sent_at")
    .eq("user_id", userId)
    .maybeSingle();
  const fresh = data && now.getTime() - new Date(data.last_seen_at).getTime() < HOUR_MS;
  if (fresh && !data.inactive_sent_at) return;
  await db
    .from("user_activity")
    .upsert(
      { user_id: userId, last_seen_at: now.toISOString(), inactive_sent_at: null },
      { onConflict: "user_id" },
    );
  // Back after the come-back emails started: stop them.
  if (data?.inactive_sent_at) {
    for (const orgId of await ownedOrgs(db, userId)) {
      await queueCrmEvent(db, {
        event: "app_active",
        userId,
        orgId,
        dedupeKey: `app_active:${data.inactive_sent_at}`,
      });
    }
  }
}

/** Owners away for 2 days or more get `inactive`, once per absence. */
export async function sweepInactive(db: ServiceClient, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - CRM_INACTIVE_AFTER_DAYS * DAY_MS).toISOString();
  const { data, error } = await db
    .from("user_activity")
    .select("user_id, last_seen_at")
    .lt("last_seen_at", cutoff)
    .is("inactive_sent_at", null)
    .limit(200);
  if (error) throw new Error(`crm: inactive sweep failed: ${error.message}`);
  let queued = 0;
  for (const u of data ?? []) {
    const days = Math.floor((now.getTime() - new Date(u.last_seen_at).getTime()) / DAY_MS);
    for (const orgId of await ownedOrgs(db, u.user_id)) {
      await queueCrmEvent(db, {
        event: "inactive",
        userId: u.user_id,
        orgId,
        details: { days_inactive: days },
        dedupeKey: `inactive:${u.last_seen_at}`,
      });
      queued += 1;
    }
    await db
      .from("user_activity")
      .update({ inactive_sent_at: now.toISOString() })
      .eq("user_id", u.user_id);
  }
  return queued;
}
