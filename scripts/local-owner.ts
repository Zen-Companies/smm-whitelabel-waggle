/**
 * Local only: attaches a login to an existing tenant as its owner and prints a one-time sign-in
 * link, without going through signup (which would create a new tenant and Zernio profile).
 *
 *   pnpm local:owner --email you@example.com [--tenant <uuid>]
 *
 * Without --tenant it only prints a fresh sign-in link for an existing user. Refuses to run
 * against anything but a local Supabase.
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
  options: { email: { type: "string" }, tenant: { type: "string" } },
});

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error(`refusing to run against ${url || "an unset URL"}: local Supabase only`);
  }
  if (!args.email) throw new Error("--email is required");
  const db = createClient<Database>(url, key, { auth: { persistSession: false } });

  const { data: list, error: listError } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  let user = list.users.find((u) => u.email?.toLowerCase() === args.email!.toLowerCase());
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email: args.email, email_confirm: true });
    if (error) throw error;
    user = data.user;
    console.log(`created user ${user.id}`);
  }

  if (args.tenant) {
    const { data: owned } = await db
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .maybeSingle();
    if (owned && owned.tenant_id !== args.tenant) {
      throw new Error(`user already owns tenant ${owned.tenant_id}`);
    }
    if (!owned) {
      const { error } = await db
        .from("tenant_members")
        .insert({ tenant_id: args.tenant, user_id: user.id, role: "owner" });
      if (error) throw error;
      const { error: auditError } = await db.from("audit_log").insert({
        tenant_id: args.tenant,
        action: "owner_attached",
        actor: "system",
        details: { userId: user.id, via: "scripts/local-owner" },
      });
      if (auditError) throw auditError;
      console.log(`attached as owner of ${args.tenant}`);
    }
  }

  const { data: link, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email: args.email,
  });
  if (linkError) throw linkError;
  console.log(
    `sign-in link (one use, 1 hour):\n${appUrl}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
