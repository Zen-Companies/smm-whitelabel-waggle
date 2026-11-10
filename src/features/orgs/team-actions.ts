"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { can } from "./abilities";
import { listMyOrgs } from "./server";
import { inviteLink, newInviteToken, sendInviteEmail } from "./team";

const ERRORS: Record<string, string> = {
  not_allowed: "Your role here can't do that. Ask an Owner or Admin.",
  last_owner: "Make another member Owner first: an organization always keeps one.",
  bad_brands: "Pick at least one brand.",
  bad_role: "Pick a role.",
  not_found: "That person or invite isn't here any more.",
};

function errorOf(error: { message: string } | null): string {
  return (error && ERRORS[error.message]) ?? "Couldn't save. Try again in a moment.";
}

/** The organization in the form, if the user manages its team (owner or admin). */
async function teamOrg(formData: FormData) {
  const orgId = z.uuid().safeParse(formData.get("orgId"));
  if (!orgId.success) return null;
  const [user, orgs] = await Promise.all([getCurrentUser(), listMyOrgs()]);
  const org = orgs.find((o) => o.id === orgId.data);
  return org && can(org.role, "team.manage") ? { org, user } : null;
}

function brandsFrom(formData: FormData): { allBrands: boolean; tenantIds: string[] } {
  const allBrands = formData.get("brands") !== "some";
  const tenantIds = allBrands
    ? []
    : formData.getAll("tenantIds").filter((v): v is string => z.uuid().safeParse(v).success);
  return { allBrands, tenantIds };
}

export type InviteState = {
  error?: string;
  field?: "email" | "brands";
  email?: string;
  /** Sent: the panel clears and the invites list shows "Invite sent to …" with Copy link. */
  sent?: { email: string; link: string; hasLogin: boolean; refreshed: boolean; at: number };
};

const roleSchema = z.enum(["admin", "member", "viewer"]);

/** Invite someone by email (T56, design OrgTeam). Works whether or not they have a login. */
export async function inviteMember(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await teamOrg(formData);
  if (!ctx) return { error: ERRORS.not_allowed };
  const rawEmail = String(formData.get("email") ?? "").trim();
  const email = z.email().safeParse(rawEmail.toLowerCase());
  if (!email.success) {
    return { error: "That doesn't look like an email address.", field: "email", email: rawEmail };
  }
  const role = roleSchema.safeParse(formData.get("role"));
  if (!role.success) return { error: ERRORS.bad_role, email: rawEmail };
  // Admins never invite owners (the role list has no Owner); the database checks again.
  const { allBrands, tenantIds } = brandsFrom(formData);
  if (!allBrands && tenantIds.length === 0) {
    return { error: ERRORS.bad_brands, field: "brands", email: rawEmail };
  }

  const db = getServiceClient();
  const { token, hash } = newInviteToken();
  const { data, error } = await db.rpc("invite_member", {
    p_org: ctx.org.id,
    p_actor: ctx.user.id,
    p_email: email.data,
    p_role: role.data,
    p_all_brands: allBrands,
    p_tenant_ids: tenantIds,
    p_token_hash: hash,
  });
  if (error || !data?.[0]) {
    if (error && !ERRORS[error.message]) Sentry.captureException(error);
    return {
      error: errorOf(error),
      field: error?.message === "bad_brands" ? "brands" : undefined,
      email: rawEmail,
    };
  }
  const { invite_id: inviteId, status } = data[0];
  if (status === "already_member" || !inviteId) {
    return {
      error: `${email.data} is already in ${ctx.org.name}. Change their role or brands from the Team list.`,
      field: "email",
      email: rawEmail,
    };
  }
  let hasLogin = false;
  try {
    ({ hasLogin } = await sendInviteEmail(db, {
      inviteId,
      token,
      orgName: ctx.org.name,
      inviter: ctx.user,
      email: email.data,
      role: role.data,
      allBrands,
      brandIds: tenantIds,
    }));
  } catch (e) {
    // The invite exists; the link can still be copied from the confirmation.
    Sentry.captureException(e, { extra: { inviteId } });
  }
  revalidatePath("/settings");
  return {
    sent: {
      email: email.data,
      link: inviteLink(token),
      hasLogin,
      refreshed: status === "refreshed",
      at: Date.now(),
    },
  };
}

export type InviteRowState = { error?: string; sent?: { link: string; at: number } };

/** "Resend" (an open or expired invite): a new link, 7 more days. */
export async function resendInvite(
  _prev: InviteRowState,
  formData: FormData,
): Promise<InviteRowState> {
  const ctx = await teamOrg(formData);
  if (!ctx) return { error: ERRORS.not_allowed };
  const inviteId = z.uuid().safeParse(formData.get("inviteId"));
  if (!inviteId.success) return { error: ERRORS.not_found };
  const db = getServiceClient();
  const { data: invite } = await db
    .from("organization_invites")
    .select("email, role, all_brands, tenant_ids, organization_id")
    .eq("id", inviteId.data)
    .maybeSingle();
  if (!invite || invite.organization_id !== ctx.org.id) return { error: ERRORS.not_found };
  const { token, hash } = newInviteToken();
  const { data: ok, error } = await db.rpc("resend_invite", {
    p_invite: inviteId.data,
    p_actor: ctx.user.id,
    p_token_hash: hash,
  });
  if (error || !ok) return { error: error ? errorOf(error) : ERRORS.not_found };
  const role = roleSchema.safeParse(invite.role);
  try {
    await sendInviteEmail(db, {
      inviteId: inviteId.data,
      token,
      orgName: ctx.org.name,
      inviter: ctx.user,
      email: invite.email,
      role: role.success ? role.data : "viewer",
      allBrands: invite.all_brands,
      brandIds: invite.tenant_ids,
    });
  } catch (e) {
    Sentry.captureException(e, { extra: { inviteId: inviteId.data } });
  }
  revalidatePath("/settings");
  return { sent: { link: inviteLink(token), at: Date.now() } };
}

export async function cancelInvite(
  _prev: InviteRowState,
  formData: FormData,
): Promise<InviteRowState> {
  const ctx = await teamOrg(formData);
  if (!ctx) return { error: ERRORS.not_allowed };
  const inviteId = z.uuid().safeParse(formData.get("inviteId"));
  if (!inviteId.success) return { error: ERRORS.not_found };
  const { error } = await getServiceClient().rpc("cancel_invite", {
    p_invite: inviteId.data,
    p_actor: ctx.user.id,
  });
  if (error) return { error: errorOf(error) };
  revalidatePath("/settings");
  return {};
}

export type MemberState = { error?: string; saved?: number; removed?: boolean };

const memberSchema = z.object({ userId: z.uuid() });

/** Role menu on a member's row. Saves in place ("Saved" on that row). */
export async function changeMemberRole(
  _prev: MemberState,
  formData: FormData,
): Promise<MemberState> {
  const ctx = await teamOrg(formData);
  if (!ctx) return { error: ERRORS.not_allowed };
  const parsed = memberSchema.safeParse({ userId: formData.get("userId") });
  const role = z.enum(["owner", "admin", "member", "viewer"]).safeParse(formData.get("role"));
  if (!parsed.success || !role.success) return { error: ERRORS.bad_role };
  const { error } = await getServiceClient().rpc("set_member_role", {
    p_org: ctx.org.id,
    p_actor: ctx.user.id,
    p_user: parsed.data.userId,
    p_role: role.data,
  });
  if (error) return { error: errorOf(error) };
  revalidatePath("/settings");
  return { saved: Date.now() };
}

/** "Change brands" on a member's row: all brands, or only the ones ticked. */
export async function changeMemberBrands(
  _prev: MemberState,
  formData: FormData,
): Promise<MemberState> {
  const ctx = await teamOrg(formData);
  if (!ctx) return { error: ERRORS.not_allowed };
  const parsed = memberSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: ERRORS.not_found };
  const { allBrands, tenantIds } = brandsFrom(formData);
  if (!allBrands && tenantIds.length === 0) return { error: ERRORS.bad_brands };
  const { error } = await getServiceClient().rpc("set_member_brands", {
    p_org: ctx.org.id,
    p_actor: ctx.user.id,
    p_user: parsed.data.userId,
    p_all_brands: allBrands,
    p_tenant_ids: tenantIds,
  });
  if (error) return { error: errorOf(error) };
  revalidatePath("/settings");
  return { saved: Date.now() };
}

/** "Remove from organization": their access to its brands ends at once. */
export async function removeMember(_prev: MemberState, formData: FormData): Promise<MemberState> {
  const ctx = await teamOrg(formData);
  if (!ctx) return { error: ERRORS.not_allowed };
  const parsed = memberSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: ERRORS.not_found };
  const { error } = await getServiceClient().rpc("remove_member", {
    p_org: ctx.org.id,
    p_actor: ctx.user.id,
    p_user: parsed.data.userId,
  });
  if (error) return { error: errorOf(error) };
  revalidatePath("/settings");
  return { removed: true };
}
