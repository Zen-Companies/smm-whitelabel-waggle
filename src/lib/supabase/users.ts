import type { ServiceClient } from "./service";

// Logins by email and emails by login (server-only SQL functions, migration 20261107120000).
// Used by the staff pages (features/staff, features/mcp); never shown to owners.

/** Email per user id; ids without a login are left out. */
export async function emailsOf(
  db: ServiceClient,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data, error } = await db.rpc("user_emails", { p_ids: unique });
  if (error) throw new Error(`reading login emails failed: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.id, r.email]));
}

/** The login with this email (any case), or null. */
export async function userIdByEmail(db: ServiceClient, email: string): Promise<string | null> {
  const { data, error } = await db.rpc("user_id_by_email", { p_email: email });
  if (error) throw new Error(`looking up a login failed: ${error.message}`);
  return data ?? null;
}
