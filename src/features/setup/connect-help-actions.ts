"use server";

import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { z } from "zod";
import { signinLinkNext } from "@/features/auth";
import { createSigninLink } from "@/features/auth/server";
import { getOpenOrg } from "@/features/tenants";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { blockedDetails, deviceOf, type InApp } from "./connect-help";
import { isInAppBrowser } from "./first-connect";

// Connect fix 2 (approved 24 Nov): the link that carries the person to Safari, Chrome or their
// phone signed in, and the audit row when Instagram's or Facebook's browser blocks the connect.

/** This site's address, as the browser sees it (behind a tunnel too). */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${host}`;
}

/**
 * The address to copy, open in Chrome or put in the QR code: a one-time sign-in link to this
 * setup screen (10 minutes), or the plain address when one can't be made.
 */
export async function makeSigninLink(
  next: string,
): Promise<{ url: string; expiresAt: string | null }> {
  const [user, org, base] = await Promise.all([getCurrentUser(), getOpenOrg(), origin()]);
  const plain = new URL(signinLinkNext(typeof next === "string" ? next : null), base).toString();
  const link = await createSigninLink(getServiceClient(), {
    userId: user.id,
    email: user.email,
    emailConfirmed: Boolean(user.email_confirmed_at),
    organizationId: org?.id ?? null,
    next: typeof next === "string" ? next : null,
    origin: base,
  });
  return link ?? { url: plain, expiresAt: null };
}

const BLOCK_DEDUPE_MS = 60 * 60 * 1000;
const appSchema = z.enum(["Instagram", "Facebook"]);

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
