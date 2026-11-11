import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { sendGhlEvent } from "@/lib/ghl";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient, type ServiceClient } from "@/lib/supabase/service";

/** The global switch: new logins need a beta code (no row = on). */
export const BETA_FLAG = "beta.required";

export async function betaRequired(db: ServiceClient): Promise<boolean> {
  const { data } = await db
    .from("feature_flags")
    .select("enabled")
    .eq("key", BETA_FLAG)
    .is("tenant_id", null)
    .maybeSingle();
  return data?.enabled ?? true;
}

export async function hasBetaAccess(db: ServiceClient, userId: string): Promise<boolean> {
  const { data } = await db
    .from("beta_access")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data !== null;
}

/**
 * The beta gate (design v3 "Beta access and feedback"): while beta codes are required, a login
 * with no beta record goes to /beta and nowhere else. Called by every page that needs a login
 * (through getCurrentTenant / getOpenOrg) and by actions that create things. Cached per request.
 */
export const requireBeta = cache(async (): Promise<void> => {
  const user = await getCurrentUser();
  const db = getServiceClient();
  if (await hasBetaAccess(db, user.id)) return;
  if (await betaRequired(db)) redirect("/beta");
});

function nameOf(meta: Record<string, unknown> | undefined, email: string | undefined): string {
  const full = meta?.full_name;
  return typeof full === "string" && full.trim() ? full.trim() : (email ?? "");
}

/**
 * Tells GHL once that someone joined the beta (event beta_joined): by code or by invite.
 * Logins that existed before the gate are never sent.
 */
export async function announceBetaJoin(db: ServiceClient, userId: string): Promise<void> {
  const { data: access } = await db
    .from("beta_access")
    .select("via, joined_at, announced_at, invited_by, beta_codes (code, label)")
    .eq("user_id", userId)
    .maybeSingle();
  if (!access || access.announced_at || access.via === "existing") return;
  const [{ data: who }, inviter] = await Promise.all([
    db.auth.admin.getUserById(userId),
    access.invited_by ? db.auth.admin.getUserById(access.invited_by) : null,
  ]);
  if (!who.user?.email) return;
  const sent = await sendGhlEvent({
    event: "beta_joined",
    email: who.user.email,
    name: nameOf(who.user.user_metadata, who.user.email),
    code: access.beta_codes?.code ?? "",
    codeLabel: access.beta_codes?.label ?? "",
    via: access.via === "invite" ? "invite" : "code",
    invitedBy: inviter?.data.user
      ? nameOf(inviter.data.user.user_metadata, inviter.data.user.email)
      : "",
    joinedAt: access.joined_at,
  });
  if (sent === "sent") {
    await db
      .from("beta_access")
      .update({ announced_at: new Date().toISOString() })
      .eq("user_id", userId);
  }
}
