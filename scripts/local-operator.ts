/**
 * Local only: gives a login the operator (admin) role, or takes it away (T34). The role lives in
 * the user's app_metadata, which only the server can change; admin pages check it.
 *
 *   pnpm local:operator --email you@example.com [--remove]
 *
 * The login must exist already (sign up, or `pnpm local:owner`). Refuses to run against anything
 * but a local Supabase. On a hosted project, set the role from the Supabase dashboard or SQL:
 *   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"operator"}'
 *   where email = 'you@example.com';
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: use the environment as is.
}

const { values: args } = parseArgs({
  options: { email: { type: "string" }, remove: { type: "boolean", default: false } },
});

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error(`refusing to run against ${url || "an unset URL"}: local Supabase only`);
  }
  if (!args.email) throw new Error("--email is required");
  const db = createClient<Database>(url, key, { auth: { persistSession: false } });

  const { data: list, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = list.users.find((u) => u.email?.toLowerCase() === args.email!.toLowerCase());
  if (!user) throw new Error(`no login for ${args.email}: sign up or run pnpm local:owner first`);

  // Supabase merges app_metadata updates, so removing means setting the key to null.
  const app_metadata = { role: args.remove ? null : "operator" };
  const { error: updateError } = await db.auth.admin.updateUserById(user.id, { app_metadata });
  if (updateError) throw updateError;
  console.log(
    args.remove
      ? `${args.email} is no longer an admin.`
      : `${args.email} is now an admin: /admin/lab and /admin/costs (refresh the page).`,
  );
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
