import { CircleAlert, CircleCheck } from "lucide-react";
import { headers } from "next/headers";
import { IllustratedEmpty } from "@/components/app/illustrated-empty";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button } from "@/components/ui/button";
import { blockedPlatforms, breakerApp, deviceOf, InAppCard, InAppGuard } from "@/features/auth";
import { can } from "@/features/orgs";
import { getCurrentTenant, ReadOnlyNote, recordInAppSwitch } from "@/features/tenants";
import { isPlatformId, platformLabel as name } from "@/lib/social/platforms";
import { loadPlatformStatuses } from "@/features/platforms";
import { getServiceClient } from "@/lib/supabase/service";
import { ConnectNoteBox } from "./connect-note-box";
import { createServerSupabase } from "@/lib/supabase/server";
import { accountLines } from "./account-lines";
import { connectAccount } from "./actions";
import { DisconnectAccount } from "./disconnect-account";
import { BlueskySetup } from "./bluesky-setup";
import { TelegramSetup } from "./telegram-setup";
import { WhatsAppSetup } from "./whatsapp-setup";
import { LineSetup } from "./line-setup";
import { connectBanner } from "./connect-banner";
import { safeReturnPath } from "./connect-return";
import { ConnectTiles } from "./connect-tiles";
import { MoreConnections } from "./more-connections";
import { loadUnfinishedConnect } from "./connect-unfinished-load";

/** " @name", or " name@x.com" for an address; empty when there's no name. */
function handleOf(username: string | null): string {
  if (!username) return "";
  return username.includes("@") ? ` ${username}` : ` @${username}`;
}

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
  // 25 Nov: an account the owner disconnected (released) isn't listed; its platform's Connect
  // tile comes back instead.
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id, platform, username, status, pinterest_board_name")
    .eq("tenant_id", tenant.id)
    .is("released_at", null)
    .order("created_at");
  const down = (accounts ?? []).find((a) => a.status !== "active");
  const mayConnect = can(tenant.role, "accounts.manage");

  const connected = [...new Set((accounts ?? []).map((a) => a.platform))];
  const statuses = await loadPlatformStatuses(getServiceClient());
  // "Didn't finish?" (26 Nov): a connect that left for the sign-in and never came back.
  const unfinished = mayConnect
    ? await loadUnfinishedConnect(
        supabase,
        tenant.id,
        (accounts ?? []).filter((a) => a.status === "active").map((a) => a.platform),
      )
    : null;
  // "Before you connect" (18 Nov): ?before=<id> after a connect whose sign-in names Zernio.
  const before = typeof params.before === "string" ? params.before : null;
  const socialNote =
    mayConnect && before && isPlatformId(before) ? (
      <ConnectNoteBox
        id={before}
        label={name(before)}
        mark={<PlatformMark platform={before} size={40} />}
        notNowHref={safeReturnPath(params.back) ?? undefined}
      />
    ) : null;
  // A setup step opened from its tile (?setup=bluesky), shown above the tiles.
  const setup = !mayConnect ? null : params.setup === "bluesky" ? (
    <BlueskySetup />
  ) : params.setup === "telegram" ? (
    <TelegramSetup />
  ) : params.setup === "whatsapp" ? (
    <WhatsAppSetup />
  ) : params.setup === "line" ? (
    <LineSetup />
  ) : null;
  // Any app's browser (27 Nov): the switch to Safari or Chrome is tried once; in Instagram's,
  // Facebook's, Messenger's or TikTok's the tiles that would fail give way to the card.
  const ua = (await headers()).get("user-agent");
  const inApp = breakerApp(ua);
  const blocked = inApp ? blockedPlatforms(inApp) : [];
  const tiles = !mayConnect ? (
    <ReadOnlyNote role={tenant.role} what="the connected accounts" />
  ) : (
    <>
      <InAppGuard where="connect" record={recordInAppSwitch} />
      {inApp && <InAppCard app={inApp} device={deviceOf(ua)} where="connect" />}
      {setup}
      {socialNote}
      <ConnectTiles
        exclude={[...connected, ...blocked]}
        statuses={statuses}
        unfinished={unfinished && blocked.includes(unfinished.platform) ? null : unfinished}
      />
      <MoreConnections before={before} />
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
                <span className="flex min-w-[200px] flex-1 items-center gap-3">
                  <PlatformMark platform={account.platform} size={36} />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">
                      {name(account.platform)}
                      {handleOf(account.username)}
                    </span>
                    {(() => {
                      // T66: what Waggle does here, and a gray line only when it differs.
                      const lines = accountLines(account.platform, {
                        pinterestBoardName: account.pinterest_board_name,
                      });
                      return (
                        <>
                          <span className="text-ink-2 text-[13px]">{lines.does}</span>
                          {lines.note && <span className="text-ink-3 text-xs">{lines.note}</span>}
                        </>
                      );
                    })()}
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
                {mayConnect && (
                  <span className="flex flex-wrap items-center gap-2">
                    {account.status !== "active" && (
                      <form action={connectAccount}>
                        <input type="hidden" name="platform" value={account.platform} />
                        <Button type="submit" variant="primary">
                          Reconnect
                        </Button>
                      </form>
                    )}
                    <DisconnectAccount
                      id={account.id}
                      label={`${name(account.platform)}${handleOf(account.username)}`}
                    />
                  </span>
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
