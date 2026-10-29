"use server";

import { z } from "zod";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  countUnreadNeedingAction,
  loadNotifications,
  type NotificationView,
} from "./notifications";

// Notification center actions (docs/design.md §5). The owner's own client: RLS scopes every
// read and write to their tenant, and they may only set read_at.

export async function fetchNotifications(): Promise<{
  items: NotificationView[];
  unread: number;
}> {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const [items, unread] = await Promise.all([
    loadNotifications(supabase, tenant.id),
    countUnreadNeedingAction(supabase, tenant.id),
  ]);
  return { items, unread };
}

export async function fetchUnreadCount(): Promise<number> {
  const tenant = await getCurrentTenant();
  return countUnreadNeedingAction(await createServerSupabase(), tenant.id);
}

export async function markAllNotificationsRead(): Promise<void> {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("tenant_id", tenant.id)
    .is("read_at", null);
}

const idSchema = z.uuid();

/** One notification opened from the panel. */
export async function markNotificationRead(id: string): Promise<void> {
  if (!idSchema.safeParse(id).success) return;
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .is("read_at", null);
}

/** Opening an item anywhere marks its notifications read (§5). */
export async function markItemNotificationsRead(itemId: string): Promise<void> {
  if (!idSchema.safeParse(itemId).success) return;
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("tenant_id", tenant.id)
    .eq("item_id", itemId)
    .is("read_at", null);
}
