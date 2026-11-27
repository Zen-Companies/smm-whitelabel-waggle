"use server";

import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { z } from "zod";
import { getOpenOrg } from "@/features/tenants";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { blockedDetails, deviceOf, type InApp } from "./connect-help";
import { isInAppBrowser } from "./first-connect";

// Connect fix 2 (approved 24 Nov): the audit row when Instagram's or Facebook's browser blocks
// the connect (and Messenger's or TikTok's, 27 Nov).

const BLOCK_DEDUPE_MS = 60 * 60 * 1000;
const appSchema = z.enum(["Instagram", "Facebook", "Messenger", "TikTok"]);

/**
 * `connect_blocked_in_app`: the block card was shown. The page calls this once per browser
 * session per app; the server also skips a repeat within the hour. The app and phone come from
 * this request's own user agent, so a client can't write anything else.
 */
export async function recordConnectBlocked(app: InApp): Promise<void> {
  try {
    if (!appSchema.safeParse(app).success) return;
    const ua = (await headers()).get("user-agent");
    const seen = isInAppBrowser(ua);
    if (seen !== app) return;
    const [user, org] = await Promise.all([getCurrentUser(), getOpenOrg()]);
    // The block card shows only on /welcome, which always has an open organization (it sends
    // anyone without one to /login), so the row is the organization's. Without one: no row.
    if (!org) return;
    const details = blockedDetails(seen, deviceOf(ua));
    const db = getServiceClient();
    const { count } = await db
      .from("organization_audit")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("action", "connect_blocked_in_app")
      .eq("actor", user.id)
      .eq("details->>platform", details.platform)
      .gte("created_at", new Date(Date.now() - BLOCK_DEDUPE_MS).toISOString());
    if ((count ?? 0) > 0) return;
    const { error } = await db.from("organization_audit").insert({
      organization_id: org.id,
      action: "connect_blocked_in_app",
      actor: user.id,
      details,
    });
    if (error) throw new Error(`organization_audit insert failed: ${error.message}`);
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "connect-help" } });
  }
}
