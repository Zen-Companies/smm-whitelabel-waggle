"use server";

import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { roomForAnotherAccount } from "@/features/billing";
import { ensureZernioProfile, getTenantFor } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { queueForOwners, queueQuietly } from "@/lib/crm";
import { getSocialProvider } from "@/lib/social";
import { isConnectable, type PlatformId } from "@/lib/social/platforms";
import { loadPlatformStatuses, statusOf } from "@/features/platforms";
import { goToConnect } from "./connect-go";
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

/** Starts Zernio's connect flow; Zernio sends the browser back to /settings afterwards. */
export async function connectAccount(formData: FormData): Promise<void> {
  const parsed = connectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/settings/accounts?connect_error=unavailable");
  const platform = parsed.data.platform as PlatformId;
  // T73b: the first-time setup asks to come back to its Connect step.
  const back = formData.get("back") === "setup" ? `/setup?step=2&connecting=${platform}` : null;
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant) redirect("/settings/accounts?connect_error=not_allowed");
  const db = getServiceClient();
  // Staff → Platforms (18 Nov): only Available platforms connect.
  if (statusOf(await loadPlatformStatuses(db), platform) !== "available") {
    redirect(`/settings/accounts?connect_error=unavailable&platform=${platform}`);
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
    redirect(`/settings/accounts?connect_error=accounts_full&platform=${platform}`);
  }

  let authUrl: string;
  try {
    // Completes the profile here if signup couldn't (T3).
    const { profileId } = await ensureZernioProfile({ db, social: getSocialProvider }, tenant.id);
    ({ authUrl } = await getSocialProvider().getConnectUrl({
      platform,
      profileId,
      redirectUrl: `${process.env.APP_URL}${back ?? `/settings/accounts?connecting=${platform}`}`,
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
    redirect(
      `/settings/accounts?connect_error=${planLimit ? "plan_limit" : "unavailable"}&platform=${platform}`,
    );
  }
  await goToConnect({ db, id: platform, authUrl });
}

export interface BlueskyState {
  error?: string;
}

/**
 * Settings → Accounts → Connect Bluesky (T60): handle + app password, sent to Zernio and never
 * kept. On success the owner lands back on Accounts with the new account listed.
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
  // Without an account in Zernio's answer, the webhook lists it a moment later.
  redirect(`/settings/accounts?${result.username ? "connected" : "connecting"}=bluesky`);
}

/** Settings → Accounts → Connect Telegram (T60): a fresh code for Zernio's bot. */
export async function startTelegram(): Promise<TelegramCode | { error: string }> {
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant) return { error: "Only Owners and Admins can connect accounts." };
  const db = getServiceClient();
  try {
    const { profileId } = await ensureZernioProfile({ db, social: getSocialProvider }, tenant.id);
    return await startTelegramFor(
      { db, social: getSocialProvider() },
      { tenantId: tenant.id, actor: tenant.userId, profileId },
    );
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
