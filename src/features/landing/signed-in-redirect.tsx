import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * A signed-in owner who lands on `/` goes straight to the inbox, as before the landing page
 * existed. Renders nothing; the page itself stays static (Cache Components), so the caller wraps
 * this in a Suspense boundary.
 */
export async function SignedInRedirect() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/inbox");
  return null;
}
