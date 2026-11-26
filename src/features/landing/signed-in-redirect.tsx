import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { signedOutHome } from "@/lib/seo";

/**
 * A signed-in owner who lands on `/` goes straight to Today (T71). Renders nothing; the page itself stays static (Cache Components), so the caller wraps
 * this in a Suspense boundary.
 */
export async function SignedInRedirect() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/today");
  return null;
}

/**
 * `/` while gowaggle.ai is the public site: owners to Today, everyone else to gowaggle.ai on
 * production (the proxy already does this with a 308; this is the fallback) or to sign in.
 */
export async function HomeRedirect(): Promise<null> {
  const signedOut = signedOutHome(process.env.VERCEL_ENV);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect(signedOut);
  }
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  redirect(data.user ? "/today" : signedOut);
}
