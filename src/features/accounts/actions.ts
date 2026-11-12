"use server";

import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ensureZernioProfile, getTenantFor } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { isConnectable } from "@/lib/social/platforms";
import { SocialProviderError } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";

const connectSchema = z.object({
  platform: z.string().refine(isConnectable, "Not a platform Waggle connects yet."),
});

/** Starts Zernio's connect flow; Zernio sends the browser back to /settings afterwards. */
export async function connectAccount(formData: FormData): Promise<void> {
  const parsed = connectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !isConnectable(parsed.data.platform)) {
    redirect("/settings?connect_error=unavailable");
  }
  const platform = parsed.data.platform;
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant) redirect("/settings?connect_error=not_allowed");
  const db = getServiceClient();

  let authUrl: string;
  try {
    // Completes the profile here if signup couldn't (T3).
    const { profileId } = await ensureZernioProfile({ db, social: getSocialProvider }, tenant.id);
    ({ authUrl } = await getSocialProvider().getConnectUrl({
      platform,
      profileId,
      redirectUrl: `${process.env.APP_URL}/settings?connecting=${platform}`,
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
      `/settings?connect_error=${planLimit ? "plan_limit" : "unavailable"}&platform=${platform}`,
    );
  }
  redirect(authUrl);
}
