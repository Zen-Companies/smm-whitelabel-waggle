import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { connectAccount } from "@/features/accounts";
import { UpgradeLink } from "@/features/billing";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { platformLabel } from "@/lib/social/platforms";
import { getServiceClient } from "@/lib/supabase/service";
import { dismissIdleNotice } from "./actions";
import { idleNoticeCopy, noticeOpen } from "./idle";

/**
 * Free plan (decided 19 Nov): on top of Today after an idle disconnect, until dismissed or every
 * account is back. Only this brand's accounts (Reconnect connects to the open brand).
 */
export async function IdleNotice() {
  const tenant = await getCurrentTenant();
  const db = getServiceClient();
  const { data: state } = await db
    .from("org_idle")
    .select("disconnected_at, notice_dismissed_at, disconnected_account_ids")
    .eq("organization_id", tenant.organizationId)
    .maybeSingle();
  if (
    !state ||
    !noticeOpen({ disconnectedAt: state.disconnected_at, dismissedAt: state.notice_dismissed_at })
  ) {
    return null;
  }
  const ids = state.disconnected_account_ids;
  if (!ids.length) return null;
  const { data: accounts } = await db
    .from("social_accounts")
    .select("platform, username")
    .eq("tenant_id", tenant.id)
    .in("id", ids)
    .neq("status", "active")
    .order("created_at");
  if (!accounts?.length) return null;

  const copy = idleNoticeCopy(
    accounts.map((a) => ({ platformLabel: platformLabel(a.platform), username: a.username })),
  );
  const platforms = [...new Set(accounts.map((a) => a.platform))].slice(0, 3);
  const canConnect = can(tenant.role, "accounts.manage");
  const canUpgrade = can(tenant.role, "billing.view");

  return (
    <section
      role="status"
      className="border-honey-border bg-honey-tint relative flex flex-col gap-2.5 rounded-xl border p-4 pr-12"
    >
      <form action={dismissIdleNotice} className="absolute top-2 right-2">
        <Button type="submit" variant="quiet" size="icon" aria-label="Dismiss">
          <X className="size-[18px]" aria-hidden />
        </Button>
      </form>
      <b className="text-[15px]">{copy.title}</b>
      <span className="text-ink-2 text-sm">{copy.body}</span>
      {(canConnect || canUpgrade) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {canConnect &&
            platforms.map((p) => (
              <form key={p} action={connectAccount}>
                <input type="hidden" name="platform" value={p} />
                <input type="hidden" name="back" value="/today" />
                <Button type="submit" variant="primary" className="min-h-[38px]">
                  Reconnect {platformLabel(p)}
                </Button>
              </form>
            ))}
          {canUpgrade && (
            <UpgradeLink
              reason="idle"
              extra={{ platform: platforms[0] ?? null }}
              className="action-link text-sm"
            >
              Upgrade to Solo
            </UpgradeLink>
          )}
        </div>
      )}
    </section>
  );
}
