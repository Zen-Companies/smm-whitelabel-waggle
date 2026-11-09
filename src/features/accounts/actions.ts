"use server";

import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ensureZernioProfile, getCurrentTenant } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";

const connectSchema = z.object({ platform: z.enum(["instagram", "facebook"]) });

/** Starts Zernio's connect flow; Zernio sends the browser back to /settings afterwards. */
export async function connectAccount(formData: FormData): Promise<void> {
  const { platform } = connectSchema.parse(Object.fromEntries(formData));
  const tenant = await getCurrentTenant();
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
    redirect(`/settings?connect_error=unavailable&platform=${platform}`);
  }
  redirect(authUrl);
}
