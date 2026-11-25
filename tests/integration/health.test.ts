import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleAccountConnected } from "@/features/accounts/events";
import { backfillComments, checkAccountsHealth } from "@/features/accounts/health";
import { MockSocialProvider } from "@/lib/social/mock";
import type { AccountHealth, ProviderComment } from "@/lib/social/types";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// docs/tasks.md T16: a disconnected account is detected without a webhook and the owner is
// emailed (alert queued); comments are backfilled after a connect. Zernio is the mock.
class HealthSocial extends MockSocialProvider {
  health: AccountHealth[] = [];
  complete = true;
  failHealth = false;
  commented: { postId: string; comments: ProviderComment[] }[] = [];
  override async getAccountsHealth() {
    if (this.failHealth) throw new Error("zernio down");
    return { accounts: this.health, complete: this.complete };
  }
  override async listCommentedPosts() {
    return this.commented.map((p) => ({ postId: p.postId }));
  }
  override async listPostComments(input?: { postId: string }) {
    return this.commented.find((p) => p.postId === input?.postId)?.comments ?? [];
  }
}

const db = serviceClient();
let social: HealthSocial;
let tenantId: string;
let userId: string;
let accountId: string;
const zernioAccountId = `acc_${randomUUID().slice(0, 8)}`;
const deps = () => ({ db, social: () => social });

const accountStatus = async () =>
  (await db.from("social_accounts").select("status, backfill_from").eq("id", accountId).single())
    .data!;

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userId = data.user!.id;
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "Health Cafe",
  });
  tenantId = rows![0].tenant_id;
  await db
    .from("tenants")
    .update({ zernio_profile_id: `prof_${randomUUID().slice(0, 8)}` })
    .eq("id", tenantId);
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: zernioAccountId,
      platform: "instagram",
      username: "healthcafe",
    })
    .select("id")
    .single();
  accountId = account!.id;
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  await db.auth.admin.deleteUser(userId);
});

const health = (over: Partial<AccountHealth> = {}): AccountHealth => ({
  accountId: zernioAccountId,
  platform: "instagram",
  username: "healthcafe",
  status: "healthy",
  needsReconnect: false,
  canPost: true,
  issues: [],
  ...over,
});

describe("account health check (T16)", () => {
  it("a token that expired without a webhook: disconnected, items paused, one reconnect email queued", async () => {
    social = new HealthSocial();
    social.health = [health({ status: "error", needsReconnect: true, issues: ["token_expired"] })];
    const { data: item } = await db
      .from("inbound_items")
      .insert({
        tenant_id: tenantId,
        social_account_id: accountId,
        kind: "comment",
        zernio_comment_id: `c_${randomUUID()}`,
        zernio_post_id: "p",
        text: "open today?",
        received_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    expect(await checkAccountsHealth(deps(), { tenantId })).toMatchObject({
      checked: 1,
      disconnected: 1,
    });

    expect((await accountStatus()).status).toBe("disconnected");
    const { data: paused } = await db
      .from("inbound_items")
      .select("status")
      .eq("id", item!.id)
      .single();
    expect(paused?.status).toBe("paused");
    const { data: alerts } = await db
      .from("alerts")
      .select("kind")
      .eq("tenant_id", tenantId)
      .eq("kind", "disconnect");
    expect(alerts).toHaveLength(1);
    const { data: audit } = await db
      .from("audit_log")
      .select("details")
      .eq("tenant_id", tenantId)
      .eq("action", "account_disconnected")
      .single();
    expect(audit?.details).toMatchObject({
      disconnectionType: "health_check",
      reason: "token_expired",
    });
  });

  it("runs at most hourly per tenant", async () => {
    social = new HealthSocial();
    expect(await checkAccountsHealth(deps(), { tenantId })).toMatchObject({ checked: 0 });
  });

  it("healthy again: the account comes back, items resume, a backfill is requested", async () => {
    social = new HealthSocial();
    social.health = [health()];
    await db.from("tenants").update({ health_checked_at: null }).eq("id", tenantId);

    expect(await checkAccountsHealth(deps(), { tenantId })).toMatchObject({ recovered: 1 });
    const account = await accountStatus();
    expect(account.status).toBe("active");
    expect(account.backfill_from).not.toBeNull();
  });
});

describe("an account deleted in Zernio (25 Nov)", () => {
  const recheck = () => db.from("tenants").update({ health_checked_at: null }).eq("id", tenantId);

  it("a failed health call changes nothing", async () => {
    social = new HealthSocial();
    social.failHealth = true;
    social.goneAccounts.add(zernioAccountId);
    await recheck();
    expect(await checkAccountsHealth(deps(), { tenantId })).toMatchObject({
      checked: 0,
      disconnected: 0,
    });
    expect((await accountStatus()).status).toBe("active");
  });

  it("a partial answer changes nothing", async () => {
    social = new HealthSocial();
    social.complete = false;
    social.goneAccounts.add(zernioAccountId);
    await recheck();
    expect(await checkAccountsHealth(deps(), { tenantId })).toMatchObject({ disconnected: 0 });
    expect((await accountStatus()).status).toBe("active");
  });

  it("missing but Zernio still has it (no 404): unchanged", async () => {
    social = new HealthSocial();
    await recheck();
    expect(await checkAccountsHealth(deps(), { tenantId })).toMatchObject({ disconnected: 0 });
    expect((await accountStatus()).status).toBe("active");
  });

  it("missing from a complete answer and 404 on its own: disconnected, reason audited", async () => {
    social = new HealthSocial();
    social.goneAccounts.add(zernioAccountId);
    await recheck();
    expect(await checkAccountsHealth(deps(), { tenantId })).toMatchObject({ disconnected: 1 });
    expect((await accountStatus()).status).toBe("disconnected");
    const { data: audit } = await db
      .from("audit_log")
      .select("details")
      .eq("tenant_id", tenantId)
      .eq("action", "account_disconnected")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(audit?.details).toMatchObject({
      disconnectionType: "health_check",
      reason: "removed in Zernio",
    });
    // Back for the tests below.
    social = new HealthSocial();
    social.health = [health()];
    await recheck();
    await checkAccountsHealth(deps(), { tenantId });
    expect((await accountStatus()).status).toBe("active");
  });
});

describe("comment backfill (T16)", () => {
  it("inserts missed comments once, skips our own and older ones, then clears the request", async () => {
    social = new HealthSocial();
    const since = new Date(Date.now() - 3_600_000);
    await db
      .from("social_accounts")
      .update({ backfill_from: since.toISOString() })
      .eq("id", accountId);
    const recent = new Date(Date.now() - 600_000).toISOString();
    const missedId = `c_${randomUUID()}`;
    social.commented = [
      {
        postId: "1789000123",
        comments: [
          {
            id: missedId,
            text: "Bukas ba kayo sa Sunday?",
            authorName: "mika.r",
            fromOwner: false,
            createdAt: recent,
          },
          {
            id: `c_${randomUUID()}`,
            text: "Yes po!",
            authorName: "harbourbean",
            fromOwner: true,
            createdAt: recent,
          },
          {
            id: `c_${randomUUID()}`,
            text: "old",
            authorName: "x",
            fromOwner: false,
            createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
          },
        ],
      },
    ];

    expect(await backfillComments(deps(), { tenantId })).toEqual({ accounts: 1, created: 1 });
    const { data: items } = await db
      .from("inbound_items")
      .select("zernio_comment_id, zernio_post_id, author_name, status")
      .eq("zernio_comment_id", missedId);
    expect(items).toEqual([
      {
        zernio_comment_id: missedId,
        zernio_post_id: "1789000123",
        author_name: "mika.r",
        status: "new",
      },
    ]);
    expect((await accountStatus()).backfill_from).toBeNull();

    // Asked again (e.g. another reconnect): the same comment isn't inserted twice.
    await db
      .from("social_accounts")
      .update({ backfill_from: since.toISOString() })
      .eq("id", accountId);
    expect(await backfillComments(deps(), { tenantId })).toEqual({ accounts: 1, created: 0 });
  });

  it("a fresh connect starts the 30-day catch-up instead of the 24-hour backfill (19 Nov)", async () => {
    const zid = `acc_${randomUUID().slice(0, 8)}`;
    const { accountId: id } = await handleAccountConnected(db, {
      tenantId,
      zernioAccountId: zid,
      platform: "facebook",
      username: "healthcafe.fb",
    });
    const { data } = await db.from("social_accounts").select("backfill_from").eq("id", id).single();
    expect(data!.backfill_from).toBeNull();
    const { count } = await db
      .from("catch_ups")
      .select("id", { count: "exact", head: true })
      .eq("social_account_id", id);
    expect(count).toBe(1);
  });
});
