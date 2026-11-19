"use server";

import * as Sentry from "@sentry/nextjs";
import { orgOnFree, roomForAnotherAccount, upgradeHref } from "@/features/billing";
import { loadPlatformStatuses, recordSignin, statusOf } from "@/features/platforms";
import { ensureZernioProfile, getTenantFor } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { queueForOwners, queueQuietly } from "@/lib/crm";
import { getSocialProvider } from "@/lib/social";
import { isConnectable, type PlatformId } from "@/lib/social/platforms";
import { isIntegrationKind, SocialProviderError, type IntegrationKind } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";
import { needsConnectNote, opensWelcome } from "./connect-note";

// Connecting without losing your place (design "Your plan next to your profile, and connecting
// in a new tab", approved 18 Nov). Connect asks for Zernio's link without reloading the page.
// When the link opens our welcome page, the browser goes there as before. When it opens the
// partner's own page, the "Before you connect" note opens in place; Continue asks again for a
// link that comes back to /connect/done, and opens it in a new tab.

/** X connects through the same sign-in once Staff → Platforms makes it Available (18 Nov). */
const SIGNIN_LATER: readonly string[] = ["twitter"];

export type StartConnect =
  /** Go there in this tab now (our welcome page). */
  | { kind: "go"; url: string }
  /** Show the note first; Continue calls again with mode "tab". */
  | { kind: "note" }
  /** The link for the new tab. */
  | { kind: "open"; url: string }
  /** Already connected (an ads connection Zernio already had). */
  | { kind: "connected" }
  /** Something stopped it: the page's banner says what. */
  | { kind: "error"; href: string };

const fail = (code: string, id: string): StartConnect => ({
  kind: "error",
  href: `/settings/accounts?connect_error=${code}&platform=${encodeURIComponent(id)}`,
});

/** CRM: a connect blocked by the plan's accounts (once a day per organization). */
async function queueAccountLimit(db: ReturnType<typeof getServiceClient>, orgId: string) {
  await queueQuietly(() =>
    queueForOwners(db, orgId, {
      event: "account_limit",
      dedupeKey: `account_limit:${orgId}:${new Date().toISOString().slice(0, 10)}`,
    }),
  );
}

export async function startConnect(id: string, mode: "here" | "tab"): Promise<StartConnect> {
  const social = isConnectable(id) || SIGNIN_LATER.includes(id);
  if (!social && !isIntegrationKind(id)) return fail("unavailable", id);
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant) return fail("not_allowed", id);
  const db = getServiceClient();
  if (statusOf(await loadPlatformStatuses(db), id) !== "available") return fail("unavailable", id);
  if (social && !(await roomForAnotherAccount(db, tenant.id))) {
    await queueAccountLimit(db, tenant.organizationId);
    // Free: the upgrade screen, never an add-on (19 Nov).
    if (await orgOnFree(db, tenant.organizationId)) {
      return { kind: "error", href: upgradeHref("accounts") };
    }
    return fail("accounts_full", id);
  }

  // X Ads hangs off the brand's X account (docs.zernio.com/connect/connect-ads).
  let postingAccountId: string | undefined;
  if (id === "xads") {
    const { data } = await db
      .from("social_accounts")
      .select("zernio_account_id")
      .eq("tenant_id", tenant.id)
      .eq("platform", "twitter")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!data?.zernio_account_id) return fail("needs_x", id);
    postingAccountId = data.zernio_account_id;
  }

  const appUrl = process.env.APP_URL ?? "";
  const redirectUrl =
    mode === "tab"
      ? `${appUrl}/connect/done?platform=${encodeURIComponent(id)}`
      : `${appUrl}/settings/accounts?connecting=${encodeURIComponent(id)}`;
  let authUrl: string;
  try {
    const { profileId } = await ensureZernioProfile({ db, social: getSocialProvider }, tenant.id);
    if (social) {
      ({ authUrl } = await getSocialProvider().getConnectUrl({
        platform: id as PlatformId,
        profileId,
        redirectUrl,
      }));
    } else {
      const r = await getSocialProvider().getIntegrationConnectUrl({
        kind: id as IntegrationKind,
        profileId,
        postingAccountId,
        redirectUrl,
        signal: AbortSignal.timeout(20_000),
      });
      if ("alreadyConnected" in r) return { kind: "connected" };
      authUrl = r.authUrl;
    }
    await writeAudit(db, {
      tenantId: tenant.id,
      action: "account_connect_started",
      actor: tenant.userId,
      details: { platform: id, mode },
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, platform: id } });
    const planLimit = error instanceof SocialProviderError && error.details.status === 402;
    return fail(planLimit ? "plan_limit" : "unavailable", id);
  }

  if (mode === "tab") return { kind: "open", url: authUrl };
  // Remember what this platform's sign-in showed (Staff → Platforms), the mock aside.
  const welcome = opensWelcome(authUrl, appUrl);
  try {
    const host = new URL(authUrl).host;
    const mock = host === (appUrl ? new URL(appUrl).host : "") || host.startsWith("localhost");
    if (!mock) await recordSignin(db, id, welcome ? "welcome" : "platform").catch(() => undefined);
  } catch {
    // not a URL: the client refuses it below
  }
  return needsConnectNote(id, authUrl, appUrl) ? { kind: "note" } : { kind: "go", url: authUrl };
}
