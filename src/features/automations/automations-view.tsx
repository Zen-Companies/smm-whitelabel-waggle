import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import type { CommentAutomation } from "@/lib/social/types";
import { createServerSupabase } from "@/lib/supabase/server";
import { AutomationsList } from "./automations-list";
import { supportsCommentAutomation } from "./comment-dm";

/**
 * Teach Waggle → Automations (T77, design "Automations"): replies that happen on their own, set
 * up once. Comment to DM first; chat flows, sequences and links come next.
 */
export async function AutomationsView() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { data: rows } = await supabase
    .from("social_accounts")
    .select("platform, username, zernio_account_id")
    .eq("tenant_id", tenant.id)
    .eq("status", "active")
    .order("created_at");
  const accounts = (rows ?? [])
    .filter((a) => supportsCommentAutomation(a.platform))
    .map((a) => ({ zernioId: a.zernio_account_id, platform: a.platform, username: a.username }));

  let automations: CommentAutomation[] = [];
  let unavailable = false;
  if (tenant.zernioProfileId) {
    try {
      automations = await getSocialProvider().listCommentAutomations({
        profileId: tenant.zernioProfileId,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "listCommentAutomations" } });
      unavailable = true;
    }
  }

  return (
    <div className="flex max-w-[860px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href="/knowledge-base" className="text-honey-text text-sm font-medium">
          ← Teach Waggle
        </Link>
        <h1 className="page-title">Automations</h1>
        <p className="text-ink-2">Replies that happen on their own, set up once.</p>
      </div>
      <nav aria-label="Automation kinds" className="tabs">
        <span aria-current="page">Comment to DM</span>
      </nav>
      {unavailable ? (
        <p className="danger-box">Your automations couldn&apos;t be loaded right now. Try again in a moment.</p>
      ) : (
        <AutomationsList
          automations={automations}
          accounts={accounts}
          canEdit={can(tenant.role, "brand.settings")}
        />
      )}
      <p className="meta">
        Instagram and Facebook get the DM. TikTok, Threads, LinkedIn and YouTube get the public
        reply only. Instagram and Facebook only allow one private message per comment.
      </p>
    </div>
  );
}
