import { BeeUnplugged } from "@/components/app/bee";
import { Button } from "@/components/ui/button";
import { getCurrentTenant } from "@/features/tenants";
import { getPlatformPause } from "@/lib/social/platform-pause";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { connectAccount } from "./actions";
import { disconnectedDetails } from "./banner-copy";
import { platformLabel } from "@/lib/social/platforms";

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
      .select("id, platform, username")
      .eq("tenant_id", tenant.id)
      .neq("status", "active")
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    getPlatformPause(getServiceClient()),
  ]);

  if (down) {
    // Design v3 "Reconnect banner · D": what's held up, and since when.
    const [{ count: waiting }, { data: lastDrop }] = await Promise.all([
      supabase
        .from("inbound_items")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id)
        .eq("social_account_id", down.id)
        .eq("status", "paused"),
      supabase
        .from("audit_log")
        .select("created_at")
        .eq("tenant_id", tenant.id)
        .eq("action", "account_disconnected")
        .eq("details->>accountId", down.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const platform = platformLabel(down.platform);
    const details = disconnectedDetails({
      username: down.username,
      waiting: waiting ?? 0,
      disconnectedAt: lastDrop?.created_at ?? null,
    });
    return (
      <div
        role="status"
        className="border-line bg-surface flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border px-5 py-4"
      >
        <BeeUnplugged className="-my-1" />
        <p className="flex min-w-0 flex-[1_1_300px] flex-col">
          <strong className="text-[15px] font-semibold">{platform} is disconnected</strong>
          <span className="text-ink-2">
            {details || "New messages wait until you reconnect it."}
          </span>
        </p>
        <form action={connectAccount}>
          <input type="hidden" name="platform" value={down.platform} />
          <Button type="submit" variant="primary" className="min-h-11">
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
