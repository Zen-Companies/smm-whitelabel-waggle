import { writeAudit } from "@/lib/audit";
import type { ServiceClient } from "@/lib/supabase/service";

// The brands a user shares with an AI assistant (mcp_grants, docs/mcp/PLAN.md §4.2). Written only
// here, through the service role, after the caller checked the signed-in user.

export interface UserBrand {
  id: string;
  name: string;
}

/** The user's brands, by name. */
export async function loadUserBrands(db: ServiceClient, userId: string): Promise<UserBrand[]> {
  const { data, error } = await db
    .from("tenant_members")
    .select("tenants (id, name)")
    .eq("user_id", userId);
  if (error) throw new Error(`mcp: loading brands failed: ${error.message}`);
  return ((data ?? []) as unknown as { tenants: UserBrand | null }[])
    .flatMap((m) => (m.tenants ? [m.tenants] : []))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface GrantView {
  clientId: string;
  clientName: string;
  brandIds: string[];
  createdAt: string;
  updatedAt: string;
}

export async function loadGrants(db: ServiceClient, userId: string): Promise<GrantView[]> {
  const { data, error } = await db
    .from("mcp_grants")
    .select("client_id, client_name, tenant_ids, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`mcp: loading grants failed: ${error.message}`);
  return (data ?? []).map((g) => ({
    clientId: g.client_id,
    clientName: g.client_name,
    brandIds: g.tenant_ids,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
  }));
}

export type SaveGrantResult = { ok: true } | { ok: false; error: "no_brands" | "not_your_brand" };

/**
 * Saves which brands an assistant may use. Every brand must be the user's own; one at least.
 * Each brand's audit trail records the connection or the change (rule 11).
 */
export async function saveGrant(
  db: ServiceClient,
  input: { userId: string; clientId: string; clientName: string; brandIds: string[] },
): Promise<SaveGrantResult> {
  const wanted = [...new Set(input.brandIds)];
  if (!wanted.length) return { ok: false, error: "no_brands" };
  const own = new Set((await loadUserBrands(db, input.userId)).map((b) => b.id));
  if (wanted.some((id) => !own.has(id))) return { ok: false, error: "not_your_brand" };

  const { data: before } = await db
    .from("mcp_grants")
    .select("tenant_ids")
    .eq("user_id", input.userId)
    .eq("client_id", input.clientId)
    .maybeSingle();
  const { error } = await db.from("mcp_grants").upsert(
    {
      user_id: input.userId,
      client_id: input.clientId,
      client_name: input.clientName,
      tenant_ids: wanted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,client_id" },
  );
  if (error) throw new Error(`mcp: saving the grant failed: ${error.message}`);

  const had = new Set(before?.tenant_ids ?? []);
  const details = { clientId: input.clientId, clientName: input.clientName };
  for (const id of wanted.filter((b) => !had.has(b))) {
    await writeAudit(db, {
      tenantId: id,
      action: "ai_assistant_connected",
      actor: input.userId,
      details,
    });
  }
  for (const id of [...had].filter((b) => !wanted.includes(b) && own.has(b))) {
    await writeAudit(db, {
      tenantId: id,
      action: "ai_assistant_removed",
      actor: input.userId,
      details,
    });
  }
  return { ok: true };
}

/** Removes the grant (the caller also revokes it in Supabase). */
export async function deleteGrant(
  db: ServiceClient,
  input: { userId: string; clientId: string },
): Promise<void> {
  const { data } = await db
    .from("mcp_grants")
    .delete()
    .eq("user_id", input.userId)
    .eq("client_id", input.clientId)
    .select("client_name, tenant_ids");
  const own = new Set((await loadUserBrands(db, input.userId)).map((b) => b.id));
  for (const g of data ?? []) {
    for (const id of g.tenant_ids.filter((t) => own.has(t))) {
      await writeAudit(db, {
        tenantId: id,
        action: "ai_assistant_removed",
        actor: input.userId,
        details: { clientId: input.clientId, clientName: g.client_name },
      });
    }
  }
}
