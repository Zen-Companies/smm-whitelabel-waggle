import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

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

/** `/` while gowaggle.ai is the public site: owners to Today, everyone else to sign in. */
export async function HomeRedirect(): Promise<null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect("/login");
  }
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  redirect(data.user ? "/today" : "/login");
}
