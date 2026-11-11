"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";

// Settings → Account (design v3 "Sign-in and account", AuthAccount): one login's own details.
// Everything acts on the signed-in user only; nothing here takes a user id from the form.

const PASSWORD_MIN = 10;
export type AccountState = { error?: string; saved?: number; message?: string };

const done = (): AccountState => {
  revalidatePath("/", "layout");
  return { saved: Date.now() };
};

/** Profile → Name. */
export async function updateName(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const name = z.string().trim().min(1, "Enter your name").max(100).safeParse(formData.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ data: { full_name: name.data } });
  return error ? { error: "Couldn't save. Try again." } : done();
}

/** Profile → Change email: confirmed from the inbox(es) before it takes over. */
export async function changeEmail(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const email = z.email("Enter a valid email").safeParse(
    String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
  );
  if (!email.success) return { error: email.error.issues[0].message };
  const user = await getCurrentUser();
  if (email.data === user.email?.toLowerCase()) return { error: "That's already your email." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ email: email.data });
  if (error) {
    return {
      error: /registered|exists/i.test(error.message)
        ? "That email already has a Waggle login."
        : "Couldn't start the change. Try again in a minute.",
    };
  }
  return {
    message: `Check ${email.data} (and your current inbox) for a link to confirm. Until then, sign in with ${user.email}.`,
  };
}

const newPassword = z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`);

/** How you sign in → Change password: the current one is checked first. */
export async function changePassword(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const next = newPassword.safeParse(formData.get("password"));
  if (!next.success) return { error: next.error.issues[0].message };
  const user = await getCurrentUser();
  // A throwaway client checks the current password without touching this browser's session.
  const check = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error: wrong } = await check.auth.signInWithPassword({
    email: user.email ?? "",
    password: String(formData.get("current") ?? ""),
  });
  if (wrong) return { error: "That's not your current password." };
  await check.auth.signOut({ scope: "local" });
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password: next.data });
  if (error) {
    return {
      error: /same/i.test(error.message)
        ? "Choose a password different from the current one."
        : "Couldn't save. Try again.",
    };
  }
  return done();
}

/** How you sign in → Add a password (a Google-only login). */
export async function addPassword(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const next = newPassword.safeParse(formData.get("password"));
  if (!next.success) return { error: next.error.issues[0].message };
  const user = await getCurrentUser();
  const { data: has } = await getServiceClient().rpc("login_has_password", { p_user: user.id });
  if (has) return { error: "This login already has a password. Use Change password." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password: next.data });
  return error ? { error: "Couldn't save. Try again." } : done();
}

/** How you sign in → Disconnect Google (only offered while a password is set). */
export async function disconnectGoogle(): Promise<AccountState> {
  const user = await getCurrentUser();
  const { data: ok } = await getServiceClient().rpc("disconnect_google", { p_user: user.id });
  return ok ? done() : { error: "Add a password first, so you can still sign in." };
}

/** Sessions → Sign out everywhere: every phone and computer, this one included. */
export async function signOutEverywhere(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}

/**
 * Delete login: refused while the login is the only Owner of an organization others use. Its
 * personal organization's brands are offboarded (3 months to restore) first; then the login goes.
 */
export async function deleteLogin(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getCurrentUser();
  const typed = String(formData.get("confirm") ?? "")
    .trim()
    .toLowerCase();
  if (!user.email || typed !== user.email.toLowerCase()) {
    return { error: `Type ${user.email} to confirm.` };
  }
  const db = getServiceClient();
  const { data: ready } = await db.rpc("prepare_login_deletion", { p_user: user.id });
  if (!ready) return { error: "Make another member Owner of your organizations first." };
  const supabase = await createServerSupabase();
  await supabase.auth.signOut({ scope: "global" });
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return { error: "Couldn't delete the login. Try again, or ask us for help." };
  const store = await cookies();
  for (const c of store.getAll()) if (c.name.startsWith("waggle_")) store.delete(c.name);
  redirect("/");
}
