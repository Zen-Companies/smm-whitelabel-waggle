import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { NotificationBell } from "./notification-bell";
import { countUnreadNeedingAction } from "./notifications";

/** The bell for the app shell, with the badge count rendered on the server. */
export async function Bell() {
  const tenant = await getCurrentTenant();
  const unread = await countUnreadNeedingAction(await createServerSupabase(), tenant.id);
  return <NotificationBell initialUnread={unread} />;
}
