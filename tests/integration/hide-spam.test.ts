import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hideSpamComment, markNotSpam, unhideComment } from "@/features/approvals/decisions";
import { createPolicyStep } from "@/features/approvals/policy-step";
import { createDraftStep } from "@/features/drafting/draft-step";
import { processDueItems } from "@/features/inbox/processor";
import { createDeadline } from "@/lib/jobs";
import { createLlmClient } from "@/lib/llm/client";
import { fakeOpenRouter } from "@/lib/llm/test-utils";
import { createDbUsageRecorder } from "@/lib/llm/usage";
import { MockSocialProvider } from "@/lib/social/mock";
import { SocialProviderError } from "@/lib/social/types";
import { anonClient, claimFor, serviceClient, uniqueEmail } from "./helpers";

// T40: spam comments are hidden on the post (mock provider: nothing reaches Zernio, rule 14).
// The LLM must never be called for spam; the fake fails the test if it is.
const { models } = fakeOpenRouter(() => {
  throw new Error("the LLM must not be called for spam");
});
const db = serviceClient();
const llm = createLlmClient({ models, usage: createDbUsageRecorder(db) });
const social = new MockSocialProvider();
let failHide = false;
const flaky: typeof social = Object.assign(Object.create(social), {
  hideComment: async (input: Parameters<typeof social.hideComment>[0]) => {
    if (failHide)
      throw new SocialProviderError("Zernio hideComment failed (503)", {
        status: 503,
        ambiguous: true,
      });
    return social.hideComment(input);
  },
});
const userIds: string[] = [];
let tenantId: string;
let userId: string;
let accountId: string;
let zernioAccountId: string;

const run = () =>
  processDueItems({
    db,
    steps: {
      classified: createDraftStep({ llm, social: () => flaky }),
      drafted: createPolicyStep(),
    },
    deadline: createDeadline(),
    claim: claimFor(() => tenantId),
  });

async function spamItem(kind: "comment" | "dm" = "comment", confidence = 0.95) {
  const id = randomUUID();
  const { error } = await db.from("inbound_items").insert({
    id,
    tenant_id: tenantId,
    social_account_id: accountId,
    kind,
    ...(kind === "comment"
      ? { zernio_post_id: `post_${id}`, zernio_comment_id: `c_${id}` }
      : { zernio_message_id: `m_${id}` }),
    text: "Earn $500 a day from home, link in bio!",
    received_at: new Date().toISOString(),
    status: "classified",
    category: "spam",
    confidence,
  });
  if (error) throw error;
  return id;
}

const itemOf = async (id: string) =>
  (
    await db
      .from("inbound_items")
      .select("status, category, hidden_on_platform_at")
      .eq("id", id)
      .single()
  ).data!;
const auditOf = async (id: string, action: string) =>
  (await db.from("audit_log").select("actor, details").eq("item_id", id).eq("action", action))
    .data ?? [];
const isHidden = (id: string) => social.hidden.has(`${zernioAccountId}|c_${id}`);
const setAutoHide = (on: boolean) =>
  db.from("tenants").update({ auto_hide_spam: on }).eq("id", tenantId);

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userId = data.user!.id;
  userIds.push(userId);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "Hide Spam Test",
  });
  tenantId = rows![0].tenant_id;
  zernioAccountId = `acc_${randomUUID().slice(0, 8)}`;
  const { data: account } = await db
    .from("social_accounts")
    .insert({ tenant_id: tenantId, zernio_account_id: zernioAccountId, platform: "instagram" })
    .select("id")
    .single();
  accountId = account!.id;
});

beforeEach(async () => {
  failHide = false;
  await setAutoHide(false);
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("the job (T40)", () => {
  it("auto-hide off: a spam comment comes to the owner, still visible", async () => {
    const id = await spamItem();
    await run();
    expect(await itemOf(id)).toMatchObject({ status: "escalated", hidden_on_platform_at: null });
    expect(isHidden(id)).toBe(false);
  });

  it("auto-hide on: a spam comment is hidden on the post and ignored, audited as system", async () => {
    await setAutoHide(true);
    const id = await spamItem();
    await run();
    const item = await itemOf(id);
    expect(item.status).toBe("ignored");
    expect(item.hidden_on_platform_at).not.toBeNull();
    expect(isHidden(id)).toBe(true);
    expect(await auditOf(id, "comment_hidden")).toEqual([
      { actor: "system", details: { outcome: "done" } },
    ]);
  });

  it("auto-hide on, but not sure enough: it comes to the owner", async () => {
    await setAutoHide(true);
    const id = await spamItem("comment", 0.5);
    await run();
    expect((await itemOf(id)).status).toBe("escalated");
    expect(isHidden(id)).toBe(false);
  });

  it("auto-hide on, hiding fails: it comes to the owner instead of staying public unnoticed", async () => {
    await setAutoHide(true);
    failHide = true;
    const id = await spamItem();
    await run();
    expect(await itemOf(id)).toMatchObject({ status: "escalated", hidden_on_platform_at: null });
    expect(await auditOf(id, "comment_hidden")).toEqual([
      { actor: "system", details: { outcome: "failed" } },
    ]);
  });

  it("a spam DM is still just ignored (DMs can't be hidden)", async () => {
    await setAutoHide(true);
    const id = await spamItem("dm");
    await run();
    expect((await itemOf(id)).status).toBe("ignored");
  });
});

describe("the owner (T40)", () => {
  it("Hide on Instagram hides it, moves it to Ignored (handled) and Unhide shows it again", async () => {
    const id = await spamItem();
    await run();
    expect(await hideSpamComment({ db, social }, { tenantId, userId, itemId: id })).toEqual({
      ok: true,
      outcome: "hidden",
    });
    expect((await itemOf(id)).status).toBe("handled");
    expect(isHidden(id)).toBe(true);
    expect((await auditOf(id, "comment_hidden"))[0]).toEqual({
      actor: userId,
      details: { outcome: "done" },
    });

    expect(await unhideComment({ db, social }, { tenantId, userId, itemId: id })).toEqual({
      ok: true,
    });
    expect(await itemOf(id)).toMatchObject({ status: "handled", hidden_on_platform_at: null });
    expect(isHidden(id)).toBe(false);
    expect(await auditOf(id, "comment_unhidden")).toHaveLength(1);
  });

  it("a comment that's already gone is handled: nothing left to hide", async () => {
    const id = await spamItem();
    await run();
    const gone: typeof social = Object.assign(Object.create(social), {
      hideComment: async () => {
        throw new SocialProviderError("Zernio hideComment failed (400)", {
          status: 400,
          code: "PLATFORM_API_ERROR",
          ambiguous: false,
        });
      },
    });
    expect(await hideSpamComment({ db, social: gone }, { tenantId, userId, itemId: id })).toEqual({
      ok: true,
      outcome: "gone",
    });
    expect(await itemOf(id)).toMatchObject({ status: "handled", hidden_on_platform_at: null });
  });

  it("another tenant can't hide it", async () => {
    const id = await spamItem();
    await run();
    expect(
      await hideSpamComment({ db, social }, { tenantId: randomUUID(), userId, itemId: id }),
    ).toEqual({ ok: false, error: "not_found" });
    expect(isHidden(id)).toBe(false);
  });

  it("It's not spam keeps it in Needs you as unclear, audited", async () => {
    const id = await spamItem();
    await run();
    expect(await markNotSpam(db, { tenantId, userId, itemId: id })).toEqual({ ok: true });
    expect(await itemOf(id)).toMatchObject({ status: "escalated", category: "unclear" });
    expect(await auditOf(id, "marked_not_spam")).toHaveLength(1);
  });
});
