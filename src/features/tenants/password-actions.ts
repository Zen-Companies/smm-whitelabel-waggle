"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { PASSWORD_MIN } from "./password";

export type ResetRequestState = { error?: string; sent?: string; email?: string };

/**
 * Forgot password: Supabase emails a reset link (supabase/templates/recovery.html) that opens
 * /auth/confirm → /reset. The answer is the same whether or not the email has a login, so
 * nobody can use this page to find out who uses Waggle.
 */
export async function requestPasswordReset(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const raw = String(formData.get("email") ?? "").trim();
  const email = z.email().safeParse(raw.toLowerCase());
  if (!email.success) return { error: "Enter a valid email", email: raw };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data);
  if (error?.status === 429) {
    return {
      error: "A link was sent a moment ago. Wait a minute before asking again.",
      email: raw,
    };
  }
  return { sent: email.data };
}

export type NewPasswordState = { error?: string };

/** "Choose a new password" (the reset link signed the person in), then into Waggle. */
export async function chooseNewPassword(
  _prev: NewPasswordState,
  formData: FormData,
): Promise<NewPasswordState> {
  const password = z
    .string()
    .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
    .safeParse(formData.get("password"));
  if (!password.success) return { error: password.error.issues[0].message };
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/forgot?expired=1");
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) {
    return {
      error: /same/i.test(error.message)
        ? "That's your current password. Choose a different one."
        : "Couldn't save the password. Try again.",
    };
  }
  redirect("/inbox");
}
