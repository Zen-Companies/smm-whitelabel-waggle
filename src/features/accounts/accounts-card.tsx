import { CircleAlert, CircleCheck } from "lucide-react";
import { IllustratedEmpty } from "@/components/app/illustrated-empty";
import { Button } from "@/components/ui/button";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { connectAccount } from "./actions";
import { connectBanner } from "./connect-banner";
import { SUPPORTED_PLATFORMS } from "./events";

const PLATFORM_NAMES = { instagram: "Instagram", facebook: "Facebook" } as const;
const name = (p: string) => PLATFORM_NAMES[p as keyof typeof PLATFORM_NAMES] ?? p;

/** Connected accounts (Settings). Status is inline text + icon, never a colored chip. */
export async function AccountsCard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tenant = await getCurrentTenant();
  const banner = connectBanner(await searchParams);
  const supabase = await createServerSupabase();
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id, platform, username, status")
    .eq("tenant_id", tenant.id)
    .order("created_at");
  const down = (accounts ?? []).find((a) => a.status !== "active");

  const connectButtons = (variant: "primary" | "secondary") => (
    <div className="flex flex-wrap gap-2">
      {SUPPORTED_PLATFORMS.map((platform, i) => (
        <form key={platform} action={connectAccount}>
          <input type="hidden" name="platform" value={platform} />
          <Button type="submit" variant={i === 0 ? variant : "secondary"}>
            Connect {name(platform)}
          </Button>
        </form>
      ))}
    </div>
  );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="accounts-heading">
      <div>
        <h2 id="accounts-heading" className="section-title">
          Accounts
        </h2>
        <p className="meta">The Instagram and Facebook accounts Waggle answers for.</p>
      </div>
      {banner && (
        <p
          role={banner.tone === "error" ? "alert" : "status"}
          className={banner.tone === "error" ? "danger-box" : "text-wax-muted text-sm"}
        >
          {banner.text}
        </p>
      )}

      {!accounts?.length ? (
        <IllustratedEmpty
          illustration="connect-accounts"
          title="Connect your Instagram"
          action={connectButtons("primary")}
        >
          Comments and messages start arriving as soon as an account is connected.
        </IllustratedEmpty>
      ) : (
        <>
          {down && (
            <IllustratedEmpty illustration="reconnect" title="Let's reconnect" tint="gray">
              {name(down.platform)}
              {down.username ? ` @${down.username}` : ""} lost its connection. Messages that arrive
              meanwhile wait here until you reconnect it.
            </IllustratedEmpty>
          )}
          <ul className="card flex flex-col divide-y">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <span className="flex flex-col">
                  <span className="font-medium">
                    {name(account.platform)}
                    {account.username ? ` @${account.username}` : ""}
                  </span>
                  {account.status === "active" ? (
                    <span className="text-wax-muted inline-flex items-center gap-1.5 text-sm">
                      <CircleCheck className="text-success size-4" strokeWidth={1.75} aria-hidden />
                      Connected
                    </span>
                  ) : (
                    <span className="text-honey-light inline-flex items-center gap-1.5 text-sm">
                      <CircleAlert className="text-honey size-4" strokeWidth={1.75} aria-hidden />
                      Disconnected
                    </span>
                  )}
                </span>
                {account.status !== "active" && (
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
          {connectButtons("secondary")}
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
