import { CircleAlert, CircleCheck } from "lucide-react";
import { IllustratedEmpty } from "@/components/app/illustrated-empty";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button } from "@/components/ui/button";
import { can } from "@/features/orgs";
import { getCurrentTenant, ReadOnlyNote } from "@/features/tenants";
import { platformLabel as name } from "@/lib/social/platforms";
import { createServerSupabase } from "@/lib/supabase/server";
import { connectAccount } from "./actions";
import { BlueskySetup } from "./bluesky-setup";
import { TelegramSetup } from "./telegram-setup";
import { connectBanner } from "./connect-banner";
import { ConnectTiles } from "./connect-tiles";

/** Connected accounts (Settings). Status is inline text + icon, never a colored chip. */
export async function AccountsCard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tenant = await getCurrentTenant();
  const params = await searchParams;
  const banner = connectBanner(params);
  const supabase = await createServerSupabase();
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id, platform, username, status")
    .eq("tenant_id", tenant.id)
    .order("created_at");
  const down = (accounts ?? []).find((a) => a.status !== "active");
  const mayConnect = can(tenant.role, "accounts.manage");

  const connected = [...new Set((accounts ?? []).map((a) => a.platform))];
  // A setup step opened from its tile (?setup=bluesky), shown above the tiles.
  const setup = !mayConnect ? null : params.setup === "bluesky" ? (
    <BlueskySetup />
  ) : params.setup === "telegram" ? (
    <TelegramSetup />
  ) : null;
  const tiles = !mayConnect ? (
    <ReadOnlyNote role={tenant.role} what="the connected accounts" />
  ) : (
    <>
      {setup}
      <ConnectTiles exclude={connected} />
    </>
  );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="accounts-heading">
      <div>
        <h2 id="accounts-heading" className="section-title">
          Accounts
        </h2>
        <p className="meta">
          Connect where your customers talk to you. Waggle answers on the first group and posts on
          all of them.
        </p>
      </div>
      {banner && (
        <p
          role={banner.tone === "error" ? "alert" : "status"}
          className={banner.tone === "error" ? "danger-box" : "text-ink-2 text-sm"}
        >
          {banner.text}
        </p>
      )}

      {!accounts?.length ? (
        <>
          <IllustratedEmpty illustration="connect-accounts" title="Connect your first account">
            Comments and messages start arriving as soon as an account is connected.
          </IllustratedEmpty>
          {tiles}
        </>
      ) : (
        <>
          {down && (
            <IllustratedEmpty illustration="reconnect" title="Let's reconnect" tint="gray">
              {name(down.platform)}
              {down.username ? ` @${down.username}` : ""} lost its connection. Messages that arrive
              meanwhile wait here until you reconnect it.
            </IllustratedEmpty>
          )}
          <h3 className="text-[15px] font-semibold">Connected · {accounts.length}</h3>
          <ul className="card flex flex-col divide-y">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <span className="flex items-center gap-3">
                  <PlatformMark platform={account.platform} size={36} />
                  <span className="flex flex-col">
                    <span className="font-medium">
                      {name(account.platform)}
                      {account.username ? ` @${account.username}` : ""}
                    </span>
                    {account.status === "active" ? (
                      <span className="text-ink-2 inline-flex items-center gap-1.5 text-sm">
                        <CircleCheck
                          className="text-success size-4"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        Connected
                      </span>
                    ) : (
                      <span className="text-honey-text inline-flex items-center gap-1.5 text-sm">
                        <CircleAlert
                          className="text-honey-text size-4"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        Disconnected
                      </span>
                    )}
                  </span>
                </span>
                {account.status !== "active" && mayConnect && (
                  <form action={connectAccount}>
                    <input type="hidden" name="platform" value={account.platform} />
                    <Button type="submit" variant="primary">
                      Reconnect
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {tiles}
        </>
      )}
    </section>
  );
}

/** "2 connected" next to Accounts in the Settings section list. */
export async function ConnectedCount() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("social_accounts")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("status", "active");
  return count ? <span className="meta">{count} connected</span> : null;
}
