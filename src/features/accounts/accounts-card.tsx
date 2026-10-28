import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { connectAccount } from "./actions";
import { connectBanner } from "./connect-banner";
import { SUPPORTED_PLATFORMS } from "./events";

const PLATFORM_NAMES = { instagram: "Instagram", facebook: "Facebook" } as const;
const STATUS_LABELS: Record<string, string> = {
  active: "Connected",
  disconnected: "Disconnected",
  error: "Needs attention",
};

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected accounts</CardTitle>
        <CardDescription>
          Instagram and Facebook accounts the receptionist answers for.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {banner && (
          <p
            role={banner.tone === "error" ? "alert" : "status"}
            className={banner.tone === "error" ? "text-destructive text-sm" : "text-sm"}
          >
            {banner.text}
          </p>
        )}
        {accounts && accounts.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {accounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-4 text-sm">
                <span>
                  {PLATFORM_NAMES[account.platform as keyof typeof PLATFORM_NAMES] ??
                    account.platform}
                  {account.username ? ` · @${account.username}` : ""}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    {STATUS_LABELS[account.status] ?? account.status}
                  </span>
                  {account.status !== "active" && (
                    <form action={connectAccount}>
                      <input type="hidden" name="platform" value={account.platform} />
                      <Button type="submit" size="sm" variant="outline">
                        Reconnect
                      </Button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No accounts connected yet.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {SUPPORTED_PLATFORMS.map((platform) => (
            <form key={platform} action={connectAccount}>
              <input type="hidden" name="platform" value={platform} />
              <Button type="submit">Connect {PLATFORM_NAMES[platform]}</Button>
            </form>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
