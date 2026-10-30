import { Button } from "@/components/ui/button";
import { getCurrentTenant } from "@/features/tenants";
import { getPlatformPause } from "@/lib/social/platform-pause";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { connectAccount } from "./actions";

/**
 * Account-wide problems (docs/design.md §4): one amber banner at the top of every page that stays
 * until fixed, with a single fix button. A disconnected account, or posting paused on our side
 * (Zernio billing, T19: the owner can't fix that, so it just reassures).
 */
export async function AccountBanner() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const [{ data: down }, pause] = await Promise.all([
    supabase
      .from("social_accounts")
      .select("platform, username")
      .eq("tenant_id", tenant.id)
      .neq("status", "active")
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    getPlatformPause(getServiceClient()),
  ]);

  if (down) {
    const name = `${down.platform === "facebook" ? "Facebook" : "Instagram"}${down.username ? ` @${down.username}` : ""}`;
    return (
      <div role="status" className="banner">
        <p className="flex-1">
          <strong className="font-semibold">{name} is disconnected.</strong> New messages wait until
          you reconnect it.
        </p>
        <form action={connectAccount}>
          <input type="hidden" name="platform" value={down.platform} />
          <Button type="submit" variant="secondary">
            Reconnect
          </Button>
        </form>
      </div>
    );
  }
  if (pause) {
    return (
      <div role="status" className="banner">
        <p className="flex-1">
          <strong className="font-semibold">Replies and posts are paused on our side.</strong> They
          go out on their own as soon as it&apos;s fixed. You don&apos;t need to do anything.
        </p>
      </div>
    );
  }
  return null;
}
