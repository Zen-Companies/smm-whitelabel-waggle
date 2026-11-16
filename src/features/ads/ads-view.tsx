import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { can } from "@/features/orgs";
import { PostsHeader } from "@/features/publishing";
import { getCurrentTenant } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import type { AdAccount, AdCampaignSummary, AdConnection, AdRuleSummary } from "@/lib/social/types";
import { createServerSupabase } from "@/lib/supabase/server";
import { connectMetaAdsAction, connectNetworkAdsAction } from "./actions";
import { BoostForm, CampaignRow, SafetyRules, type BoostablePost } from "./ads-panels";
import { ChatGptAdForm, ChatGptBudgetForm, ChatGptConnectForm } from "./chatgpt-panels";
import {
  adConnections,
  networkAdAccounts,
  openAiConnection,
  type NetworkAdAccount,
} from "./connection";
import {
  AD_NETWORK_IDS,
  AD_NETWORKS,
  ADS_COMING_SOON,
  isAdNetwork,
  networkOfPlatform,
  type AdNetwork,
} from "./networks";
import { StateLabel } from "@/components/app/state-mark";

const ERRORS: Record<string, string> = {
  no_facebook: "Connect your Facebook Page in Settings → Accounts first.",
  no_linkedin: "Connect your LinkedIn Page in Settings → Accounts first.",
  no_pinterest: "Connect your Pinterest account in Settings → Accounts first.",
  reconnect_linkedin:
    "LinkedIn needs you to sign in again before ads work: reconnect LinkedIn in Settings → Accounts, then come back here.",
  reconnect_pinterest:
    "Pinterest needs you to sign in again before ads work: reconnect Pinterest in Settings → Accounts, then come back here.",
  not_allowed: "Only owners and admins can connect ads.",
  plan_limit: "Connecting ads needs a payment method on file. Contact us and we'll sort it out.",
  unavailable: "Ads couldn't be connected right now. Try again in a moment.",
};

const POSTING_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
};

/** Posts → Ads (T79, design "Posts · Ads"): boosts, safety rules, ad networks and accounts. */
export async function AdsView({
  adsError,
  justConnected,
}: {
  adsError?: string;
  /** The network just connected (Meta when the link doesn't say). */
  justConnected?: string;
}) {
  const tenant = await getCurrentTenant();
  const canEdit = can(tenant.role, "brand.settings");
  const supabase = await createServerSupabase();
  const { data: socials } = await supabase
    .from("social_accounts")
    .select("id, platform, zernio_account_id")
    .eq("tenant_id", tenant.id)
    .in("platform", ["facebook", "instagram", "linkedin", "pinterest"])
    .eq("status", "active");
  const has = (platform: string) => (socials ?? []).some((s) => s.platform === platform);
  const fb = (socials ?? []).find((s) => s.platform === "facebook");

  let conns: Partial<Record<AdNetwork, AdConnection>> = {};
  let accounts: NetworkAdAccount[] = [];
  let campaigns: AdCampaignSummary[] = [];
  let rules: AdRuleSummary[] = [];
  let leadForms: { id: string; name: string }[] = [];
  // T79c: ChatGPT ads, connected with a key; campaigns join the list above.
  let openai: AdConnection | null = null;
  let openaiAccount: AdAccount | null = null;
  let unavailable = false;
  if (tenant.zernioProfileId) {
    try {
      [conns, openai] = await Promise.all([
        adConnections(tenant.zernioProfileId),
        openAiConnection(tenant.zernioProfileId),
      ]);
      const social = getSocialProvider();
      const signal = AbortSignal.timeout(15_000);
      const list = [...Object.values(conns), ...(openai ? [openai] : [])];
      const [a, c, r, f] = await Promise.all([
        networkAdAccounts(conns, signal),
        Promise.all(list.map((x) => social.listAdCampaigns({ connectionId: x.id, signal }))),
        Promise.all(list.map((x) => social.listAdRules({ connectionId: x.id, signal }))),
        conns.meta && fb
          ? social.listLeadForms({ accountId: fb.zernio_account_id, signal })
          : Promise.resolve([]),
      ]);
      accounts = a;
      campaigns = c.flat();
      if (openai) {
        const oa = await social.listAdAccounts({ connectionId: openai.id, signal });
        openaiAccount = oa.find((x) => x.usable) ?? oa[0] ?? null;
      }
      rules = r.flat();
      leadForms = f;
    } catch (error) {
      Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "adsView" } });
      unavailable = true;
    }
  }
  const connected = AD_NETWORK_IDS.filter((n) => conns[n]);

  // Published posts on a connected network, newest first: one choice per platform.
  const byId = new Map((socials ?? []).map((s) => [s.id, s.platform]));
  const { data: posts } = await supabase
    .from("posts")
    .select("zernio_post_id, content, target_account_ids, published_at")
    .eq("tenant_id", tenant.id)
    .eq("status", "published")
    .not("zernio_post_id", "is", null)
    .order("published_at", { ascending: false })
    .limit(30);
  const boostable: BoostablePost[] = (posts ?? []).flatMap((p) =>
    [...new Set(p.target_account_ids.map((id) => byId.get(id)).filter(Boolean) as string[])]
      .map((platform) => ({ platform, network: networkOfPlatform(platform) }))
      .filter((x): x is { platform: string; network: AdNetwork } =>
        Boolean(x.network && conns[x.network]),
      )
      .map(({ platform, network }) => ({
        value: `${p.zernio_post_id}|${platform}`,
        network,
        label: `${POSTING_LABEL[platform]}: ${p.content.replace(/\s+/g, " ").slice(0, 60) || "(photo)"}`,
      })),
  );
  const justNetwork = isAdNetwork(justConnected) ? justConnected : null;

  return (
    <div className="flex max-w-[960px] flex-col gap-5">
      <PostsHeader />
      <div className="flex flex-col gap-1">
        <p className="text-ink-2">
          Boost a post. Money goes to each network from your own ad account, not to Waggle.
        </p>
      </div>
      {adsError && ERRORS[adsError] && <p className="danger-box">{ERRORS[adsError]}</p>}
      {justNetwork && conns[justNetwork] && (
        <p role="status" className="card p-4">
          {AD_NETWORKS[justNetwork].label} ads is connected.
        </p>
      )}
      {unavailable && (
        <p className="danger-box">Ads couldn&apos;t be loaded right now. Try again in a moment.</p>
      )}

      {(connected.length > 0 || openai) &&
        (campaigns.length ? (
          <ul className="card divide-line flex flex-col divide-y" aria-label="Your ads">
            {campaigns.map((c) => (
              <CampaignRow key={`${c.platform}:${c.id}`} c={c} canEdit={canEdit}>
                {c.platform === "openai" && (
                  <ChatGptBudgetForm id={c.id} current={c.budget?.amount ?? null} />
                )}
              </CampaignRow>
            ))}
          </ul>
        ) : (
          <p className="text-ink-2">No ads yet.</p>
        ))}
      {openai && canEdit && openaiAccount && (
        <ChatGptAdForm currency={openaiAccount.currency} account={openaiAccount.name} />
      )}

      {connected.length > 0 && (
        <>
          {canEdit && (
            <BoostForm
              posts={boostable}
              accounts={accounts}
              leadForms={leadForms}
              idempotencyKey={randomUUID()}
              networks={connected}
            />
          )}
          <SafetyRules
            rules={rules}
            accounts={accounts.filter((a) => a.usable)}
            canEdit={canEdit}
          />
        </>
      )}

      <section className="card flex flex-col gap-3 p-5" aria-labelledby="networks-title">
        <h2 id="networks-title" className="section-title">
          Ad networks
        </h2>
        <ul className="divide-line flex flex-col divide-y text-sm">
          {AD_NETWORK_IDS.map((n) => {
            const net = AD_NETWORKS[n];
            const mine = accounts.filter((a) => a.network === n);
            const postingReady = net.posting.some((p) => has(p));
            return (
              <li key={n} className="flex flex-col gap-1.5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="flex-1 font-semibold">{net.label}</b>
                  {conns[n] ? (
                    <span className="text-success font-semibold">Connected</span>
                  ) : !postingReady ? (
                    <span className="text-ink-3">
                      Connect {n === "meta" ? "your Facebook Page" : POSTING_LABEL[n]} in Settings →
                      Accounts first
                    </span>
                  ) : canEdit && !unavailable ? (
                    <form action={n === "meta" ? connectMetaAdsAction : connectNetworkAdsAction}>
                      {n !== "meta" && <input type="hidden" name="network" value={n} />}
                      <Button type="submit" variant="secondary">
                        Connect {net.label} ads
                      </Button>
                    </form>
                  ) : (
                    <span className="text-ink-3">Ask an owner or admin to connect it</span>
                  )}
                </div>
                {mine.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 pl-3">
                    <span>
                      {a.name} ({a.currency})
                    </span>
                    <span className={a.billing === "missing" ? "text-danger" : "text-ink-3"}>
                      {a.billing === "missing"
                        ? `No payment method: add one in ${net.label}`
                        : a.usable
                          ? "Ready"
                          : "Can't be used right now"}
                    </span>
                  </div>
                ))}
                {!conns[n] && n === "linkedin" && postingReady && (
                  <span className="meta">
                    Uses your LinkedIn sign-in. Only Company Page posts can be boosted.
                  </span>
                )}
                {!conns[n] && n === "pinterest" && postingReady && (
                  <span className="meta">Uses your Pinterest sign-in.</span>
                )}
              </li>
            );
          })}
          <li className="flex flex-col gap-2 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <b className="flex-1 font-semibold">ChatGPT ads</b>
              {openai ? (
                <span className="text-success font-semibold">Connected</span>
              ) : !canEdit ? (
                <span className="text-ink-3">Ask an owner or admin to connect it</span>
              ) : null}
            </div>
            {openai && openaiAccount && (
              <div className="flex flex-wrap items-center gap-2 pl-3">
                <span>
                  {openaiAccount.name} ({openaiAccount.currency})
                </span>
                <span className="text-ink-3">
                  {openaiAccount.usable ? "Ready" : "Can't be used right now"}
                </span>
              </div>
            )}
            {!openai && canEdit && !unavailable && <ChatGptConnectForm />}
            <span className="meta">
              Small ads inside ChatGPT answers. You write them here; there&apos;s no post to boost.
            </span>
          </li>
          {ADS_COMING_SOON.map((label) => (
            <li key={label} className="flex flex-wrap items-center gap-2 py-3">
              <b className="flex-1 font-semibold">{label}</b>
              <StateLabel state="soon">Coming soon</StateLabel>
            </li>
          ))}
        </ul>
        <p className="meta">Each network bills its own ad account and reviews every ad.</p>
      </section>
    </div>
  );
}
