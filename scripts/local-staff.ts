/**
 * Local only: gives a login a staff role, or takes it away (MCP Phase 3, docs/mcp/PLAN.md §7).
 * Roles: admin, developer, support, viewer (staff_role_permissions has what each may do).
 *
 *   pnpm local:staff --email you@example.com --role admin
 *   pnpm local:staff --email you@example.com --remove
 *
 * The login must exist already (sign up, or `pnpm local:owner`). Refuses to run against anything
 * but a local Supabase. On a hosted project, use the SQL editor:
 *   insert into public.staff_members (user_id, role)
 *   select id, 'admin' from auth.users where email = 'you@example.com'
 *   on conflict (user_id) do update set role = excluded.role;
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: use the environment as is.
}

const ROLES = ["admin", "developer", "support", "viewer"] as const;

const { values: args } = parseArgs({
  options: {
    email: { type: "string" },
    role: { type: "string" },
    remove: { type: "boolean", default: false },
  },
});

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error(`refusing to run against ${url || "an unset URL"}: local Supabase only`);
  }
  if (!args.email) throw new Error("--email is required");
  if (!args.remove && !(ROLES as readonly string[]).includes(args.role ?? "")) {
    throw new Error(`--role must be one of ${ROLES.join(", ")} (or pass --remove)`);
  }
  const db = createClient<Database>(url, key, { auth: { persistSession: false } });

  const { data: list, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = list.users.find((u) => u.email?.toLowerCase() === args.email!.toLowerCase());
  if (!user) throw new Error(`no login for ${args.email}: sign up or run pnpm local:owner first`);

  if (args.remove) {
    const { error: e } = await db.from("staff_members").delete().eq("user_id", user.id);
    if (e) throw e;
    console.log(`${args.email} is no longer staff.`);
    return;
  }
  const { error: e } = await db
    .from("staff_members")
    .upsert({ user_id: user.id, role: args.role! }, { onConflict: "user_id" });
  if (e) throw e;
  console.log(`${args.email} is now ${args.role}. Refresh the page to see the staff links.`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
