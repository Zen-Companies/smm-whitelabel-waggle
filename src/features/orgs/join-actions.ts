"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { acceptInviteAndOpen } from "./join";
import { ensurePersonalOrg, setOrgCookie } from "./server";
import { hashInviteToken } from "./team";

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/);
const page = (token: string) => `/invite/${token}`;

/** Accepts as the signed-in login and opens the organization's first brand, else `fallback`. */
async function acceptAndOpen(token: string, userId: string, fallback: string): Promise<never> {
  redirect((await acceptInviteAndOpen(token, userId)) ? "/inbox" : fallback);
}

/** "Join" on the invite page (signed in with the invited email). */
export async function joinFromInvite(formData: FormData): Promise<void> {
  const token = tokenSchema.safeParse(formData.get("token"));
  if (!token.success) redirect("/welcome");
  const user = await getCurrentUser();
  await acceptAndOpen(token.data, user.id, page(token.data));
}

/** "Decline": the inviter sees "Declined"; the person stays where they were. */
export async function declineFromInvite(formData: FormData): Promise<void> {
  const token = tokenSchema.safeParse(formData.get("token"));
  if (!token.success) redirect("/welcome");
  const user = await getCurrentUser();
  await getServiceClient().rpc("decline_invite", {
    p_token_hash: hashInviteToken(token.data),
    p_user: user.id,
  });
  redirect(`${page(token.data)}?declined=1`);
}

/** Signed in with another email: sign out, then the invite page offers sign-up or sign-in. */
export async function signOutForInvite(formData: FormData): Promise<void> {
  const token = tokenSchema.safeParse(formData.get("token"));
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect(token.success ? page(token.data) : "/login");
}

export type JoinSignUpState = { error?: string; message?: string; fullName?: string };

const signUpSchema = z.object({
  token: tokenSchema,
  fullName: z.string().trim().min(1, "Enter your name").max(100, "Keep it under 100 characters"),
  password: z.string().min(10, "Use at least 10 characters"),
});

/**
 * "Create login and join" (design OrgInviteJoin): the email comes from the invite, never the
 * form. With a session the login joins at once and lands in the organization; with email
 * confirmation on, the confirmation link lands on /welcome, which lists the invite.
 */
export async function signUpAndJoin(
  _prev: JoinSignUpState,
  formData: FormData,
): Promise<JoinSignUpState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  const fullName = String(formData.get("fullName") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message, fullName };
  const db = getServiceClient();
  const { data: invite } = await db.rpc("invite_by_token", {
    p_token_hash: hashInviteToken(parsed.data.token),
  });
  const open = invite?.[0];
  if (!open || open.status !== "open") redirect(page(parsed.data.token));

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email: open.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${process.env.APP_URL}/auth/confirm`,
    },
  });
  if (error) {
    return /already/i.test(error.message)
      ? { error: "This email already has a Waggle login. Sign in to join instead.", fullName }
      : { error: error.message, fullName };
  }
  if (!data.user?.identities?.length) {
    return { error: "This email already has a Waggle login. Sign in to join instead.", fullName };
  }
  if (!data.session) {
    await ensurePersonalOrg(db, data.user.id);
    return {
      message: `Check ${open.email} to confirm your login. The invite will be waiting on your first screen.`,
    };
  }
  return acceptAndOpen(parsed.data.token, data.user.id, page(parsed.data.token));
}

/** /welcome: Join or Decline an invite to this login's email, without the link. */
export async function respondToInvite(formData: FormData): Promise<void> {
  const inviteId = z.uuid().safeParse(formData.get("inviteId"));
  if (!inviteId.success) redirect("/welcome");
  const user = await getCurrentUser();
  const db = getServiceClient();
  if (formData.get("intent") === "decline") {
    await db.rpc("decline_invite_by_id", { p_invite: inviteId.data, p_user: user.id });
    redirect("/welcome");
  }
  const { data } = await db.rpc("accept_invite_by_id", {
    p_invite: inviteId.data,
    p_user: user.id,
  });
  const result = data?.[0];
  if (
    result?.organization_id &&
    (result.status === "joined" || result.status === "already_member")
  ) {
    await setOrgCookie(result.organization_id);
    redirect("/inbox");
  }
  redirect("/welcome");
}
