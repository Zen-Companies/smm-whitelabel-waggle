import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveDraft } from "@/features/approvals/decisions";
import { createPolicyStep } from "@/features/approvals/policy-step";
import { createSendStep } from "@/features/approvals/send-step";
import { processDueItems } from "@/features/inbox/processor";
import { pollFacebookReviews } from "@/features/inbox/reviews";
import { createDeadline } from "@/lib/jobs";
import { MockSocialProvider } from "@/lib/social/mock";
import { anonClient, claimFor, serviceClient, uniqueEmail } from "./helpers";

// T42: Facebook Page reviews are polled into the inbox and answered only with the owner's OK.
// Zernio is the in-process mock (rule 14).
const db = serviceClient();
const social = new MockSocialProvider();
const userIds: string[] = [];
let tenantId: string;
let userId: string;
let accountId: string;
const zernioAccountId = `acc_${randomUUID().slice(0, 8)}`;

const poll = () => pollFacebookReviews({ db, social: () => social, shouldContinue: () => true });
const run = () =>
  processDueItems({
    db,
    steps: { drafted: createPolicyStep(), sending: createSendStep({ social: () => social }) },
    deadline: createDeadline(),
    claim: claimFor(() => tenantId),
  });
const items = async () =>
  (
    await db
      .from("inbound_items")
      .select("id, kind, status, author_name, text, review_recommends, zernio_review_id, permalink")
      .eq("tenant_id", tenantId)
      .order("received_at")
  ).data ?? [];

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userId = data.user!.id;
  userIds.push(userId);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "Reviews Cafe",
  });
  tenantId = rows![0].tenant_id;
  const { data: account } = await db
    .from("social_accounts")
    .insert({ tenant_id: tenantId, zernio_account_id: zernioAccountId, platform: "facebook" })
    .select("id, created_at")
    .single();
  accountId = account!.id;
  const after = new Date(new Date(account!.created_at).getTime() + 60_000).toISOString();
  social.reviews.set(zernioAccountId, [
    {
      id: "rev_new",
      reviewerName: "Lara V",
      recommends: false,
      text: "Waited 40 minutes on Saturday and no one said sorry.",
      createdAt: after,
      hasReply: false,
      reviewUrl: "https://www.facebook.com/r/1",
    },
    {
      id: "rev_answered",
      reviewerName: "Ben",
      recommends: true,
      text: "Great!",
      createdAt: after,
      hasReply: true,
      reviewUrl: null,
    },
    {
      id: "rev_old",
      reviewerName: "Old",
      recommends: true,
      text: "From before Waggle",
      createdAt: "2020-01-01T00:00:00Z",
      hasReply: false,
      reviewUrl: null,
    },
  ]);
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("Facebook Page reviews (T42)", () => {
  it("stores an unanswered review written since connecting, once", async () => {
    expect(await poll()).toMatchObject({ pages: 1, created: 1, failed: 0 });
    // Polled again right away: not due yet. Forced due: nothing new either.
    expect(await poll()).toMatchObject({ pages: 0, created: 0 });
    await db.from("social_accounts").update({ reviews_polled_at: null }).eq("id", accountId);
    expect(await poll()).toMatchObject({ pages: 1, created: 0 });

    const stored = await items();
    expect(stored).toEqual([
      expect.objectContaining({
        kind: "review",
        status: "new",
        author_name: "Lara V",
        review_recommends: false,
        zernio_review_id: "rev_new",
        permalink: "https://www.facebook.com/r/1",
      }),
    ]);
  });

  it("waits for the owner even in auto mode, then posts the reply once", async () => {
    const [item] = await items();
    await db
      .from("inbound_items")
      .update({ status: "drafted", category: "faq", confidence: 0.95 })
      .eq("id", item.id);
    await db
      .from("autonomy_settings")
      .update({ mode: "auto" })
      .eq("tenant_id", tenantId)
      .eq("category", "faq");
    const { data: draft } = await db
      .from("drafts")
      .insert({
        tenant_id: tenantId,
        item_id: item.id,
        body: "Hi Lara, we're sorry about the wait on Saturday.",
        model: "test",
      })
      .select("id")
      .single();

    await run();
    expect((await items())[0].status).toBe("awaiting_approval");
    const { data: change } = await db
      .from("audit_log")
      .select("details")
      .eq("item_id", item.id)
      .eq("action", "status_changed")
      .eq("details->>to", "awaiting_approval")
      .single();
    expect(change?.details).toMatchObject({ policyReason: "review_public" });

    expect(
      await approveDraft(db, { tenantId, userId, itemId: item.id, draftId: draft!.id }),
    ).toEqual({ ok: true });
    await db.from("inbound_items").update({ next_run_at: null }).eq("id", item.id);
    await run();

    expect((await items())[0].status).toBe("sent");
    expect(
      social.sends.filter((x) => x.kind === "review" && x.targetId === "rev_new"),
    ).toHaveLength(1);
    // The reply now shows on the review, so a later poll doesn't bring it back.
    await db.from("social_accounts").update({ reviews_polled_at: null }).eq("id", accountId);
    expect(await poll()).toMatchObject({ created: 0 });
  });
});
