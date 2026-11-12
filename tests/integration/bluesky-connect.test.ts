import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectBlueskyFor } from "@/features/accounts/bluesky";
import { MockSocialProvider } from "@/lib/social";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// T60: Bluesky connects with a handle and an app password typed in Waggle.
const db = serviceClient();
const social = new MockSocialProvider();
const tenants: string[] = [];
const userIds: string[] = [];

async function ownerTenant(name: string) {
  const { data, error } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  if (error || !data.user) throw error ?? new Error("no user");
  userIds.push(data.user.id);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: data.user.id,
    p_name: name,
  });
  tenants.push(rows![0].tenant_id);
  return { tenantId: rows![0].tenant_id as string, userId: data.user.id };
}

let owner: { tenantId: string; userId: string };
let other: { tenantId: string; userId: string };
const handle = `cafe-${randomUUID().slice(0, 8)}.bsky.social`;

beforeAll(async () => {
  owner = await ownerTenant("Bluesky Cafe");
  other = await ownerTenant("Other Bluesky Cafe");
});

afterAll(async () => {
  await db.from("tenants").delete().in("id", tenants);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

const connect = (who: { tenantId: string; userId: string }, appPassword: string) =>
  connectBlueskyFor(
    { db, social },
    {
      tenantId: who.tenantId,
      actor: who.userId,
      profileId: "prof_shared",
      identifier: handle,
      appPassword,
    },
  );

describe("Bluesky connect", () => {
  it("refuses a wrong app password without listing anything", async () => {
    await expect(connect(owner, "wrong-pass")).resolves.toEqual({
      ok: false,
      error: "bad_credentials",
    });
    const { data } = await db.from("social_accounts").select("id").eq("tenant_id", owner.tenantId);
    expect(data).toEqual([]);
  });

  it("lists the account right away and audits it without the password", async () => {
    await expect(connect(owner, "abcd-efgh-ijkl-mnop")).resolves.toEqual({
      ok: true,
      username: handle,
    });
    const { data: accounts } = await db
      .from("social_accounts")
      .select("platform, username, status")
      .eq("tenant_id", owner.tenantId);
    expect(accounts).toEqual([{ platform: "bluesky", username: handle, status: "active" }]);

    const { data: audit } = await db
      .from("audit_log")
      .select("action, details")
      .eq("tenant_id", owner.tenantId);
    expect(audit?.map((a) => a.action)).toEqual(
      expect.arrayContaining(["account_connect_started", "account_connected"]),
    );
    expect(JSON.stringify(audit)).not.toContain("abcd-efgh");
  });

  it("connecting again is fine (the webhook that follows does the same)", async () => {
    await expect(connect(owner, "abcd-efgh-ijkl-mnop")).resolves.toMatchObject({ ok: true });
    const { count } = await db
      .from("social_accounts")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", owner.tenantId);
    expect(count).toBe(1);
  });

  it("won't take another brand's Bluesky account", async () => {
    await expect(connect(other, "abcd-efgh-ijkl-mnop")).resolves.toEqual({
      ok: false,
      error: "taken",
    });
  });
});
