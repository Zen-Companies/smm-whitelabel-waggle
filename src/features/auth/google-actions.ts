"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { signInNext } from "./sign-in-next";

/**
 * "Continue with Google" (docs/auth/AUDIT.md): Supabase's Google sign-in, back to
 * /auth/callback. Google lets people pick the account; on an invite page the invited email is
 * suggested (`login_hint`). `next` follows the same rules as password sign-in.
 */
export async function continueWithGoogle(formData: FormData): Promise<void> {
  const next = signInNext(formData.get("next"));
  const hint = z.email().safeParse(formData.get("hint"));
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.APP_URL}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: {
        prompt: "select_account",
        ...(hint.success ? { login_hint: hint.data } : {}),
      },
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) redirect(`/login?error=google&next=${encodeURIComponent(next)}`);
  redirect(data.url);
}
