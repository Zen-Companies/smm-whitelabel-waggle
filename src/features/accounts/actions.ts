"use server";

import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { orgOnFree, roomForAnotherAccount, upgradeHref } from "@/features/billing";
import { ensureZernioProfile, getTenantFor } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { queueForOwners, queueQuietly } from "@/lib/crm";
import { getSocialProvider } from "@/lib/social";
import { isConnectable, type PlatformId } from "@/lib/social/platforms";
import { loadPlatformStatuses, statusOf } from "@/features/platforms";
import { goToConnect } from "./connect-go";
import {
  connectErrorHref,
  connectOrigin,
  connectReturnHref,
  DEFAULT_RETURN,
  firstConnectHref,
} from "./connect-return";
import { isFirstAccount } from "./first-account";
import { SocialProviderError } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";
import { blueskyErrorText, blueskyInputSchema, connectBlueskyFor } from "./bluesky";
import {
  checkTelegramFor,
  startTelegramFor,
  type TelegramCheck,
  type TelegramCode,
} from "./telegram";

// X connects through the same sign-in once Staff → Platforms makes it Available (18 Nov).
const ZERNIO_SIGNIN_LATER: readonly string[] = ["twitter"];
const connectSchema = z.object({
  platform: z
    .string()
    .refine(
      (p) => isConnectable(p) || ZERNIO_SIGNIN_LATER.includes(p),
      "Not a platform Waggle connects yet.",
    ),
});

/**
 * Starts the connect flow for a social platform. The form may send `back`, the page it was on:
 * errors go back there and say so in place, and so does the sign-in, except for the brand's
 * first account, which lands on setup step 2 (20 Nov).
 */
export async function connectAccount(formData: FormData): Promise<void> {
  const origin = connectOrigin(formData.get("back"));
  const parsed = connectSchema.safeParse({ platform: formData.get("platform") });
  if (!parsed.success) redirect(connectErrorHref(origin, "unavailable"));
  const platform = parsed.data.platform as PlatformId;
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant) redirect(connectErrorHref(origin, "not_allowed", platform));
  const db = getServiceClient();
  // Staff → Platforms (18 Nov): only Available platforms connect.
  if (statusOf(await loadPlatformStatuses(db), platform) !== "available") {
    redirect(connectErrorHref(origin, "unavailable", platform));
  }
  // The plan's connected accounts (Pricing Bible). Off until billing ships.
  if (!(await roomForAnotherAccount(db, tenant.id))) {
    // CRM: a connect blocked by the plan's accounts (once a day per organization).
    await queueQuietly(() =>
      queueForOwners(db, tenant.organizationId, {
        event: "account_limit",
        dedupeKey: `account_limit:${tenant.organizationId}:${new Date().toISOString().slice(0, 10)}`,
      }),
    );
    // Free: the upgrade screen, never an add-on (19 Nov).
    if (await orgOnFree(db, tenant.organizationId)) redirect(upgradeHref("accounts"));
    redirect(connectErrorHref(origin, "accounts_full", platform));
  }
  const back = connectReturnHref({
    origin,
    platform,
    firstAccount: await isFirstAccount(db, tenant.id),
  });

  let authUrl: string;
  try {
    // Completes the profile here if signup couldn't (T3).
    const { profileId } = await ensureZernioProfile({ db, social: getSocialProvider }, tenant.id);
    ({ authUrl } = await getSocialProvider().getConnectUrl({
      platform,
      profileId,
      redirectUrl: `${process.env.APP_URL}${back}`,
    }));
    await writeAudit(db, {
      tenantId: tenant.id,
      action: "account_connect_started",
      actor: tenant.userId,
      details: { platform },
    });
  } catch (error) {
    // Visible in the server log even without Sentry (local dev). Our own and Zernio's error
    // text only, never customer text (rule 10).
    console.error(
      `connect ${platform} failed for tenant ${tenant.id}:`,
      error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 500) : "unknown error",
      error instanceof Error && "details" in error ? JSON.stringify(error.details) : "",
    );
    Sentry.captureException(error, { extra: { tenantId: tenant.id, platform } });
    const planLimit = error instanceof SocialProviderError && error.details.status === 402;
    redirect(connectErrorHref(origin, planLimit ? "plan_limit" : "unavailable", platform));
  }
  await goToConnect({ db, id: platform, authUrl, back: origin });
}

export interface BlueskyState {
  error?: string;
}

/**
 * Settings → Accounts → Connect Bluesky (T60): handle + app password, sent to Zernio and never
 * kept. On success the owner lands back on Accounts with the new account listed, or on setup step
 * 2 when it's the brand's first account (20 Nov).
 */
export async function connectBluesky(
  _prev: BlueskyState,
  formData: FormData,
): Promise<BlueskyState> {
  const parsed = blueskyInputSchema.safeParse({
    identifier: formData.get("identifier") ?? "",
    appPassword: formData.get("appPassword") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check both fields." };
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant) return { error: "Only Owners and Admins can connect accounts." };
  const db = getServiceClient();

  const firstAccount = await isFirstAccount(db, tenant.id);
  let result;
  try {
    const { profileId } = await ensureZernioProfile({ db, social: getSocialProvider }, tenant.id);
    result = await connectBlueskyFor(
      { db, social: getSocialProvider() },
      { tenantId: tenant.id, actor: tenant.userId, profileId, ...parsed.data },
    );
  } catch (error) {
    // Error names only: the form data holds the app password.
    console.error(
      `connect bluesky failed for tenant ${tenant.id}:`,
      error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 500) : "unknown error",
    );
    Sentry.captureException(error, { extra: { tenantId: tenant.id, platform: "bluesky" } });
    return { error: blueskyErrorText("unavailable") };
  }
  if (!result.ok) {
    if (result.error === "plan_limit") {
      Sentry.captureMessage("Zernio plan limit on Bluesky connect", {
        extra: { tenantId: tenant.id },
      });
    }
    return { error: blueskyErrorText(result.error) };
  }
  if (firstAccount) redirect(firstConnectHref("bluesky"));
  // Without an account in Zernio's answer, the webhook lists it a moment later.
  redirect(`${DEFAULT_RETURN}?${result.username ? "connected" : "connecting"}=bluesky`);
}

/**
 * Settings → Accounts → Connect Telegram (T60): a fresh code for Zernio's bot. `after` is where
 * the card goes once it connects: setup step 2 for the brand's first account (20 Nov).
 */
export async function startTelegram(): Promise<
  (TelegramCode & { after: string | null }) | { error: string }
> {
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant) return { error: "Only Owners and Admins can connect accounts." };
  const db = getServiceClient();
  try {
    const { profileId } = await ensureZernioProfile({ db, social: getSocialProvider }, tenant.id);
    const [code, firstAccount] = await Promise.all([
      startTelegramFor(
        { db, social: getSocialProvider() },
        { tenantId: tenant.id, actor: tenant.userId, profileId },
      ),
      isFirstAccount(db, tenant.id),
    ]);
    return { ...code, after: firstAccount ? firstConnectHref("telegram") : null };
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, platform: "telegram" } });
    const planLimit = error instanceof SocialProviderError && error.details.status === 402;
    return {
      error: planLimit
        ? "We can't add Telegram for this brand right now: our connection limit is full. We've been alerted; please try again later."
        : "Couldn't get a code from Telegram's connector. Please try again.",
    };
  }
}

const codeSchema = z.string().trim().min(4).max(40);

/** Whether the owner has sent the code yet. Called every few seconds by the setup card. */
export async function checkTelegram(code: string): Promise<TelegramCheck | { error: string }> {
  const parsed = codeSchema.safeParse(code);
  if (!parsed.success) return { error: "That code isn't valid. Get a new one." };
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant) return { error: "Only Owners and Admins can connect accounts." };
  const db = getServiceClient();
  try {
    const { profileId } = await ensureZernioProfile({ db, social: getSocialProvider }, tenant.id);
    return await checkTelegramFor(
      { db, social: getSocialProvider() },
      { tenantId: tenant.id, profileId, code: parsed.data },
    );
  } catch (error) {
    // Tried again on the next check; reported so a stuck connector is noticed.
    Sentry.captureException(error, { extra: { tenantId: tenant.id, platform: "telegram" } });
    return { status: "pending" };
  }
}
