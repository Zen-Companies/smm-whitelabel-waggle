import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentTenant } from "@/features/tenants";
import { getPlatformPause } from "@/lib/social/platform-pause";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { connectAccount } from "./actions";
import { reconnectBarCopy } from "./banner-copy";
import { ReturnHere } from "./return-here";
import { platformLabel } from "@/lib/social/platforms";

/**
 * Account-wide problems (docs/design.md §4): one thin bar at the top of every page that stays
 * until fixed and says what it costs, with a single fix button (T72: no big card). A disconnected account, or posting paused on our side
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
      // 25 Nov: one the owner disconnected on purpose needs no reconnect bar.
      .is("released_at", null)
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
    const copy = reconnectBarCopy({
      platform,
      waiting: waiting ?? 0,
      disconnectedAt: lastDrop?.created_at ?? null,
    });
    return (
      <div
        role="status"
        className="border-honey-border bg-honey-tint flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-1.5"
      >
        <CircleAlert className="text-honey-text size-[18px] shrink-0" strokeWidth={2} aria-hidden />
        <p className="min-w-0 flex-[1_1_320px] text-sm">
          <strong className="font-semibold">{copy.headline}</strong> {copy.detail}
          {down.username ? <span className="text-ink-3"> @{down.username}</span> : null}
        </p>
        <form action={connectAccount}>
          <input type="hidden" name="platform" value={down.platform} />
          <ReturnHere />
          <Button type="submit" variant="primary" className="min-h-[38px]">
            Reconnect {platform}
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
