import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { getMailer } from "@/lib/email/mailer";
import type { ServiceClient } from "@/lib/supabase/service";
import { isOrgRole, type OrgRole } from "./abilities";
import { inviteEmail } from "./invite-email";

/** A new invite link's secret. Only its hash is stored; the token lives in the email. */
export function newInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteLink(token: string): string {
  return `${process.env.APP_URL ?? ""}/invite/${token}`;
}

export function displayName(user: Pick<User, "email" | "user_metadata">): string {
  const full = user.user_metadata?.full_name;
  return typeof full === "string" && full.trim() ? full.trim() : (user.email ?? "Someone");
}

export interface TeamMember {
  userId: string;
  email: string;
  name: string | null;
  role: OrgRole;
  allBrands: boolean;
  brandIds: string[];
  lastSignInAt: string | null;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: Exclude<OrgRole, "owner">;
  allBrands: boolean;
  brandIds: string[];
  createdAt: string;
  expiresAt: string;
  declinedAt: string | null;
}

export interface Team {
  members: TeamMember[];
  invites: TeamInvite[];
  brands: { id: string; name: string }[];
}

/**
 * The Team page (T56): members with email and name (auth.users, through a server-only
 * function), open invites and the ones declined in the last 7 days, and the organization's
 * open brands for the "only these brands" picker. The caller checks the user is in the
 * organization; invites are only loaded for owners and admins.
 */
export async function loadTeam(
  db: ServiceClient,
  orgId: string,
  withInvites: boolean,
): Promise<Team> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [{ data: members }, { data: brands }, invites] = await Promise.all([
    db.rpc("organization_team", { p_org: orgId }),
    db
      .from("tenants")
      .select("id, name")
      .eq("organization_id", orgId)
      .is("offboarded_at", null)
      .order("created_at"),
    withInvites
      ? db
          .from("organization_invites")
          .select("id, email, role, all_brands, tenant_ids, created_at, expires_at, declined_at")
          .eq("organization_id", orgId)
          .is("accepted_at", null)
          .is("cancelled_at", null)
          .or(`declined_at.is.null,declined_at.gte.${weekAgo}`)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  return {
    members: (members ?? []).flatMap((m) =>
      isOrgRole(m.role)
        ? [
            {
              userId: m.user_id,
              email: m.email,
              name: m.full_name,
              role: m.role,
              allBrands: m.all_brands,
              brandIds: m.tenant_ids,
              lastSignInAt: m.last_sign_in_at,
            },
          ]
        : [],
    ),
    invites: (invites.data ?? []).flatMap((i) =>
      i.role === "admin" || i.role === "member" || i.role === "viewer"
        ? [
            {
              id: i.id,
              email: i.email,
              role: i.role,
              allBrands: i.all_brands,
              brandIds: i.tenant_ids,
              createdAt: i.created_at,
              expiresAt: i.expires_at,
              declinedAt: i.declined_at,
            },
          ]
        : [],
    ),
    brands: brands ?? [],
  };
}

/** Sends (or resends) the invite email. Returns whether the address already has a login. */
export async function sendInviteEmail(
  db: ServiceClient,
  input: {
    inviteId: string;
    token: string;
    orgName: string;
    inviter: Pick<User, "email" | "user_metadata">;
    email: string;
    role: Exclude<OrgRole, "owner">;
    allBrands: boolean;
    brandIds: string[];
  },
): Promise<{ hasLogin: boolean }> {
  const [{ data: hasLogin }, { data: brands }] = await Promise.all([
    db.rpc("email_has_login", { p_email: input.email }),
    input.allBrands
      ? Promise.resolve({ data: [] as { name: string }[] })
      : db.from("tenants").select("name").in("id", input.brandIds).order("name"),
  ]);
  const email = inviteEmail({
    orgName: input.orgName,
    inviterName: displayName(input.inviter),
    role: input.role,
    allBrands: input.allBrands,
    brandNames: (brands ?? []).map((b) => b.name),
    email: input.email,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    link: inviteLink(input.token),
    hasLogin: hasLogin === true,
  });
  // One send per link: a resend makes a new token, so a new key.
  await getMailer().send({
    ...email,
    to: [input.email],
    idempotencyKey: `invite-${input.inviteId}-${hashInviteToken(input.token).slice(0, 16)}`,
  });
  return { hasLogin: hasLogin === true };
}
