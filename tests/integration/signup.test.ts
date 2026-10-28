import { afterAll, describe, expect, it } from "vitest";
import { ensureZernioProfile, setupOwnerTenant } from "@/features/tenants/setup";
import { anonClient, fakeZernio, serviceClient, uniqueEmail } from "./helpers";

// docs/tasks.md T3: a signup creates exactly one tenant and one linked Zernio profile, even on retry.
const db = serviceClient();
const createdUsers: string[] = [];

async function signUpUser(businessName: string) {
  const { data, error } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
    options: { data: { business_name: businessName } },
  });
  if (error || !data.user) throw error ?? new Error("no user");
  createdUsers.push(data.user.id);
  return data.user;
}

async function stateFor(userId: string) {
  const { data: members } = await db
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", userId);
  const tenantIds = (members ?? []).map((m) => m.tenant_id);
  const { data: tenants } = await db
    .from("tenants")
    .select("id, name, zernio_profile_id")
    .in("id", tenantIds);
  const { data: audit } = await db
    .from("audit_log")
    .select("action")
    .in("tenant_id", tenantIds)
    .order("created_at");
  return {
    members: members ?? [],
    tenants: tenants ?? [],
    actions: (audit ?? []).map((a) => a.action),
  };
}

afterAll(async () => {
  for (const userId of createdUsers) {
    const { data } = await db.from("tenant_members").select("tenant_id").eq("user_id", userId);
    for (const m of data ?? []) await db.from("tenants").delete().eq("id", m.tenant_id);
    await db.auth.admin.deleteUser(userId);
  }
});

describe("signup → tenant + Zernio profile", () => {
  it("creates one tenant, one owner and one linked profile, and a retry changes nothing", async () => {
    const user = await signUpUser("Harbour Bakery");
    const zernio = fakeZernio();
    const deps = { db, social: () => zernio.provider };

    const first = await setupOwnerTenant(deps, { userId: user.id, businessName: "Harbour Bakery" });
    const second = await setupOwnerTenant(deps, {
      userId: user.id,
      businessName: "Harbour Bakery",
    });

    expect(second).toEqual(first);
    expect(first.profileId).not.toBeNull();
    const state = await stateFor(user.id);
    expect(state.members).toEqual([{ tenant_id: first.tenantId, role: "owner" }]);
    expect(state.tenants).toEqual([
      { id: first.tenantId, name: "Harbour Bakery", zernio_profile_id: first.profileId },
    ]);
    expect(zernio.profiles.size).toBe(1);
    expect(zernio.profiles.get(first.tenantId)?.name).toBe(
      `Harbour Bakery (${first.tenantId.replace(/-/g, "").slice(0, 8)})`,
    );
    expect(state.actions).toEqual(["tenant_created", "zernio_profile_linked"]);
  });

  it("concurrent retries still create one tenant and one profile", async () => {
    const user = await signUpUser("Ferry Cafe");
    const zernio = fakeZernio();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        setupOwnerTenant(
          { db, social: () => zernio.provider },
          { userId: user.id, businessName: "Ferry Cafe" },
        ),
      ),
    );

    expect(new Set(results.map((r) => r.tenantId)).size).toBe(1);
    const state = await stateFor(user.id);
    expect(state.tenants).toHaveLength(1);
    expect(zernio.profiles.size).toBe(1);
    expect(state.tenants[0].zernio_profile_id).toBe(zernio.profiles.get(results[0].tenantId)?.id);
  });

  it("a lost Zernio response is healed on the next attempt by adopting the same profile", async () => {
    const user = await signUpUser("Pier Florist");
    const zernio = fakeZernio();
    const deps = { db, social: () => zernio.provider };
    zernio.loseNextResponse();

    const first = await setupOwnerTenant(deps, { userId: user.id, businessName: "Pier Florist" });
    expect(first.profileId).toBeNull();
    expect((await stateFor(user.id)).tenants[0].zernio_profile_id).toBeNull();

    const retry = await ensureZernioProfile(deps, first.tenantId);

    expect(retry.linked).toBe(true);
    expect(zernio.profiles.size).toBe(1);
    expect(retry.profileId).toBe(zernio.profiles.get(first.tenantId)?.id);
    const { data: audit } = await db
      .from("audit_log")
      .select("details")
      .eq("tenant_id", first.tenantId)
      .eq("action", "zernio_profile_linked")
      .single();
    expect(audit?.details).toEqual({ profileId: retry.profileId, alreadyExisted: true });
  });

  it("two businesses with the same name get distinct profile names", async () => {
    const zernio = fakeZernio();
    const a = await signUpUser("Joe's Cafe");
    const b = await signUpUser("Joe's Cafe");
    const ta = await setupOwnerTenant(
      { db, social: () => zernio.provider },
      { userId: a.id, businessName: "Joe's Cafe" },
    );
    const tb = await setupOwnerTenant(
      { db, social: () => zernio.provider },
      { userId: b.id, businessName: "Joe's Cafe" },
    );

    const names = [...zernio.profiles.values()].map((p) => p.name);
    expect(ta.tenantId).not.toBe(tb.tenantId);
    expect(new Set(names).size).toBe(2);
  });
});
