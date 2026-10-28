import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import type { Database } from "./database.types";

/** The signed-in user's client: RLS applies. Use in Server Components, Actions and Routes. */
export async function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  }
  // Request-time only: the client reads the clock (session expiry), which Cache Components
  // refuses during prerendering.
  await connection();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** The verified signed-in user (checked with Supabase Auth, not just the cookie), or /login. */
export async function getCurrentUser(): Promise<User> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return data.user;
}
