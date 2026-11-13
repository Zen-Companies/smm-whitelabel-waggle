import { randomUUID } from "node:crypto";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import type { AdAccount, AdCampaignSummary, AdRuleSummary } from "@/lib/social/types";
import { createServerSupabase } from "@/lib/supabase/server";
import { connectMetaAdsAction } from "./actions";
import { BoostForm, CampaignRow, SafetyRules, type BoostablePost } from "./ads-panels";
import { metaAdsConnection } from "./connection";

const ERRORS: Record<string, string> = {
  no_facebook: "Connect your Facebook Page in Settings → Accounts first.",
  not_allowed: "Only owners and admins can connect ads.",
  plan_limit: "Connecting ads needs a payment method on file. Contact us and we'll sort it out.",
  unavailable: "Meta ads couldn't be connected right now. Try again in a moment.",
};

/** Posts → Ads (T79, design "Posts · Ads"): Meta boosts, safety rules, ad accounts. */
export async function AdsView({
  adsError,
  justConnected,
}: {
  adsError?: string;
  justConnected?: boolean;
}) {
  const tenant = await getCurrentTenant();
  const canEdit = can(tenant.role, "brand.settings");
  const supabase = await createServerSupabase();
  const { data: socials } = await supabase
    .from("social_accounts")
    .select("id, platform, zernio_account_id")
    .eq("tenant_id", tenant.id)
    .in("platform", ["facebook", "instagram"])
    .eq("status", "active");
  const fb = (socials ?? []).find((s) => s.platform === "facebook");

  let connected = false;
  let accounts: AdAccount[] = [];
  let campaigns: AdCampaignSummary[] = [];
  let rules: AdRuleSummary[] = [];
  let leadForms: { id: string; name: string }[] = [];
  let unavailable = false;
  if (tenant.zernioProfileId) {
    try {
      const conn = await metaAdsConnection(tenant.zernioProfileId);
      if (conn) {
        connected = true;
        const social = getSocialProvider();
        const signal = AbortSignal.timeout(15_000);
        [accounts, campaigns, rules, leadForms] = await Promise.all([
          social.listAdAccounts({ connectionId: conn.id, signal }),
          social.listAdCampaigns({ connectionId: conn.id, signal }),
          social.listAdRules({ connectionId: conn.id, signal }),
          fb
            ? social.listLeadForms({ accountId: fb.zernio_account_id, signal })
            : Promise.resolve([]),
        ]);
      }
    } catch (error) {
      Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "adsView" } });
      unavailable = true;
    }
  }

  // Published posts on Facebook or Instagram, newest first: one choice per platform.
  const byId = new Map((socials ?? []).map((s) => [s.id, s.platform]));
  const { data: posts } = await supabase
    .from("posts")
    .select("zernio_post_id, content, target_account_ids, published_at")
    .eq("tenant_id", tenant.id)
    .eq("status", "published")
    .not("zernio_post_id", "is", null)
    .order("published_at", { ascending: false })
    .limit(20);
  const boostable: BoostablePost[] = (posts ?? []).flatMap((p) =>
    [...new Set(p.target_account_ids.map((id) => byId.get(id)).filter(Boolean))].map(
      (platform) => ({
        value: `${p.zernio_post_id}|${platform}`,
        label: `${platform === "instagram" ? "Instagram" : "Facebook"}: ${p.content.replace(/\s+/g, " ").slice(0, 60) || "(photo)"}`,
      }),
    ),
  );

  return (
    <div className="flex max-w-[960px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <h1 className="page-title">Ads</h1>
          <Link href="/posts" className="text-honey-text text-sm font-medium underline">
            Back to posts
          </Link>
        </div>
        <p className="text-ink-2">
          Boost a post. Money goes to Meta from your own ad account, not to Waggle.
        </p>
      </div>
      {adsError && ERRORS[adsError] && <p className="danger-box">{ERRORS[adsError]}</p>}
      {justConnected && connected && (
        <p role="status" className="card p-4">
          Meta ads is connected.
        </p>
      )}

      {!connected ? (
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="section-title">Connect Meta ads</h2>
          <p className="text-ink-2 text-sm">
            Boost your Facebook and Instagram posts from Waggle. You need a Meta ad account with a
            payment method; Meta bills it directly.
          </p>
          {unavailable ? (
            <p className="danger-box">
              Ads couldn&apos;t be loaded right now. Try again in a moment.
            </p>
          ) : !fb ? (
            <p className="text-ink-2 text-sm">
              Connect your Facebook Page in Settings → Accounts first.
            </p>
          ) : canEdit ? (
            <form action={connectMetaAdsAction}>
              <Button type="submit" variant="primary">
                Connect Meta ads
              </Button>
            </form>
          ) : (
            <p className="text-ink-2 text-sm">Ask an owner or admin to connect it.</p>
          )}
        </section>
      ) : (
        <>
          {campaigns.length ? (
            <ul className="card divide-line flex flex-col divide-y" aria-label="Your boosts">
              {campaigns.map((c) => (
                <CampaignRow key={c.id} c={c} canEdit={canEdit} />
              ))}
            </ul>
          ) : (
            <p className="text-ink-2">No boosts yet.</p>
          )}
          {canEdit && (
            <BoostForm
              posts={boostable}
              accounts={accounts}
              leadForms={leadForms}
              idempotencyKey={randomUUID()}
            />
          )}
          <SafetyRules
            rules={rules}
            accounts={accounts.filter((a) => a.usable)}
            canEdit={canEdit}
          />
          <section className="card flex flex-col gap-2 p-5" aria-labelledby="accounts-title">
            <h2 id="accounts-title" className="section-title">
              Ad accounts
            </h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {accounts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <b className="font-semibold">
                    Meta: {a.name} ({a.currency})
                  </b>
                  <span className={a.billing === "missing" ? "text-danger" : "text-ink-3"}>
                    {a.billing === "missing"
                      ? "No payment method: add one in Meta Ads Manager"
                      : a.usable
                        ? "Ready"
                        : "Can't be used right now"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="meta">
              Each network bills its own ad account. Google, TikTok and more come next.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
