import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveFollowups, sendQuietLeadFollowUps } from "@/features/automations/quiet-leads-store";
import { MockSocialProvider } from "@/lib/social/mock";
import { SocialProviderError } from "@/lib/social/types";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// Follow-ups for leads that go quiet (Pricing Bible, 18 Nov; design "Billing round 2" §4): saving
// makes a sequence per account; the job adds a lead who went quiet, once. Zernio is the mock.
const db = serviceClient();
const social = new MockSocialProvider();
const userIds: string[] = [];
const tenantIds: string[] = [];
const HOUR = 60 * 60_000;
const now = new Date();
const ago = (hours: number) => new Date(now.getTime() - hours * HOUR).toISOString();

let tenantId: string;
let accountId: string;
let zernioAccountId: string;
let userId: string;

async function quietLead(opts: {
  customerHoursAgo: number;
  oursHoursAgo: number | null;
  contact?: string | null;
  stage?: string | null;
  /** A second lead in an existing thread. */
  conversationId?: string;
}) {
  const convId = opts.conversationId ?? randomUUID();
  if (!opts.conversationId)
    await db.from("conversations").insert({
      id: convId,
      tenant_id: tenantId,
      social_account_id: accountId,
      zernio_conversation_id: `conv_${convId}`,
      platform: "instagram",
      last_customer_message_at: ago(opts.customerHoursAgo),
      zernio_contact_id:
        opts.contact === undefined ? `contact_${convId.slice(0, 8)}` : opts.contact,
    });
  const itemId = randomUUID();
  const { error } = await db.from("inbound_items").insert({
    id: itemId,
    tenant_id: tenantId,
    social_account_id: accountId,
    kind: "dm",
    zernio_message_id: `m_${itemId}`,
    conversation_id: convId,
    author_name: "Ana",
    text: "How much for a cake for 20?",
    received_at: ago(opts.customerHoursAgo),
    status: "sent",
    category: "lead",
    confidence: 0.9,
  });
  if (error) throw error;
  if (opts.oursHoursAgo !== null) {
    await db.from("drafts").insert({
      tenant_id: tenantId,
      item_id: itemId,
      body: "It's $45, want to order?",
      status: "sent",
      sent_at: ago(opts.oursHoursAgo),
    });
  }
  const { data: lead } = await db
    .from("leads")
    .insert({ tenant_id: tenantId, item_id: itemId, name: "Ana", stage: opts.stage ?? null })
    .select("id")
    .single();
  return Object.assign(lead!.id as string, { convId }) as string & { convId: string };
}

const followedUp = async (leadId: string) =>
  (await db.from("leads").select("followed_up_at").eq("id", leadId).single()).data!.followed_up_at;

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userId = data.user!.id;
  userIds.push(userId);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "Sunny Side",
  });
  tenantId = rows![0].tenant_id;
  tenantIds.push(tenantId);
  zernioAccountId = `acc_${randomUUID().slice(0, 8)}`;
  const { data: account } = await db
    .from("social_accounts")
    .insert({ tenant_id: tenantId, zernio_account_id: zernioAccountId, platform: "instagram" })
    .select("id")
    .single();
  accountId = account!.id;
});

afterAll(async () => {
  for (const id of tenantIds) await db.from("tenants").delete().eq("id", id);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("follow up quiet leads", () => {
  it("saving makes one sequence per account, on, with the owner's message", async () => {
    const r = await saveFollowups(
      { db, social },
      {
        tenantId,
        profileId: "prof_1",
        actor: userId,
        settings: {
          enabled: true,
          waitMinutes: 20 * 60,
          message: "Hi {first name}, still keen?",
          whatsappTemplate: null,
        },
      },
    );
    expect(r.accounts).toBe(1);
    const { data } = await db
      .from("followup_settings")
      .select("sequences, enabled")
      .eq("tenant_id", tenantId)
      .single();
    expect(Object.keys(data!.sequences as object)).toEqual([zernioAccountId]);
    expect(data!.enabled).toBe(true);
  });

  it("the job adds a lead who went quiet, once; not one still talking, booked or out of the window", async () => {
    const quiet = await quietLead({ customerHoursAgo: 21, oursHoursAgo: 20.5 });
    const theirTurn = await quietLead({ customerHoursAgo: 21, oursHoursAgo: null });
    const booked = await quietLead({ customerHoursAgo: 21, oursHoursAgo: 20.5, stage: "booked" });
    const tooLate = await quietLead({ customerHoursAgo: 25, oursHoursAgo: 24.5 });
    const tooSoon = await quietLead({ customerHoursAgo: 3, oursHoursAgo: 2 });
    const noContact = await quietLead({ customerHoursAgo: 21, oursHoursAgo: 20.5, contact: null });

    const first = await sendQuietLeadFollowUps({ db, social: () => social, now });
    expect(first.sent).toBe(1);
    expect(await followedUp(quiet)).not.toBeNull();
    for (const id of [theirTurn, booked, tooLate, tooSoon, noContact]) {
      expect(await followedUp(id)).toBeNull();
    }
    // Once per lead.
    const again = await sendQuietLeadFollowUps({ db, social: () => social, now });
    expect(again.sent).toBe(0);
    const { data: audit } = await db
      .from("audit_log")
      .select("action")
      .eq("tenant_id", tenantId)
      .eq("action", "lead_followed_up");
    expect(audit).toHaveLength(1);
  });

  it("switched off: nothing goes out", async () => {
    await saveFollowups(
      { db, social },
      {
        tenantId,
        profileId: "prof_1",
        actor: userId,
        settings: { enabled: false, waitMinutes: 20 * 60, message: "Hi", whatsappTemplate: null },
      },
    );
    const lead = await quietLead({ customerHoursAgo: 21, oursHoursAgo: 20.5 });
    const r = await sendQuietLeadFollowUps({ db, social: () => social, now });
    expect(r.sent).toBe(0);
    expect(await followedUp(lead)).toBeNull();
  });
});

describe("follow-ups after the review (18 Nov)", () => {
  const save = (enabled: boolean) =>
    saveFollowups(
      { db, social },
      {
        tenantId,
        profileId: "prof_1",
        actor: userId,
        settings: { enabled, waitMinutes: 20 * 60, message: "Hi", whatsappTemplate: null },
      },
    );

  it("two leads in one conversation: one follow-up, and both show it", async () => {
    await save(true);
    const first = await quietLead({ customerHoursAgo: 21, oursHoursAgo: 20.5 });
    const second = await quietLead({
      customerHoursAgo: 21,
      oursHoursAgo: 20.5,
      conversationId: (first as unknown as { convId: string }).convId,
    });
    const enroll = social.enrollInSequence.bind(social);
    const contact = `contact_${(first as unknown as { convId: string }).convId.slice(0, 8)}`;
    let calls = 0;
    social.enrollInSequence = async (input) => {
      if (input.contactIds.includes(contact)) calls++;
      return enroll(input);
    };
    try {
      await sendQuietLeadFollowUps({ db, social: () => social, now });
      await sendQuietLeadFollowUps({ db, social: () => social, now });
    } finally {
      social.enrollInSequence = enroll;
    }
    expect(calls).toBe(1);
    expect(await followedUp(first)).not.toBeNull();
    expect(await followedUp(second)).not.toBeNull();
  });

  it("a timeout may have gone through: the conversation stays claimed (no second message)", async () => {
    await save(true);
    const lead = await quietLead({ customerHoursAgo: 21, oursHoursAgo: 20.5 });
    const enroll = social.enrollInSequence.bind(social);
    social.enrollInSequence = async () => {
      throw new SocialProviderError("timeout", { ambiguous: true });
    };
    try {
      await sendQuietLeadFollowUps({ db, social: () => social, now });
    } finally {
      social.enrollInSequence = enroll;
    }
    const convId = (lead as unknown as { convId: string }).convId;
    const { data } = await db
      .from("conversations")
      .select("followed_up_at")
      .eq("id", convId)
      .single();
    expect(data!.followed_up_at).not.toBeNull();
    const r = await sendQuietLeadFollowUps({ db, social: () => social, now });
    expect(r.sent).toBe(0);
  });

  it("a clear refusal frees it for the next run", async () => {
    await save(true);
    const lead = await quietLead({ customerHoursAgo: 21, oursHoursAgo: 20.5 });
    const enroll = social.enrollInSequence.bind(social);
    social.enrollInSequence = async () => {
      throw new SocialProviderError("bad request", { status: 400, ambiguous: false });
    };
    try {
      await sendQuietLeadFollowUps({ db, social: () => social, now });
    } finally {
      social.enrollInSequence = enroll;
    }
    const convId = (lead as unknown as { convId: string }).convId;
    const { data } = await db
      .from("conversations")
      .select("followed_up_at")
      .eq("id", convId)
      .single();
    expect(data!.followed_up_at).toBeNull();
  });

  it("an offboarded brand sends nothing", async () => {
    await save(true);
    const lead = await quietLead({ customerHoursAgo: 21, oursHoursAgo: 20.5 });
    const off = await db
      .from("tenants")
      .update({ offboarded_at: now.toISOString(), purge_after: now.toISOString() })
      .eq("id", tenantId);
    expect(off.error).toBeNull();
    try {
      await sendQuietLeadFollowUps({ db, social: () => social, now });
      expect(await followedUp(lead)).toBeNull();
    } finally {
      await db
        .from("tenants")
        .update({ offboarded_at: null, purge_after: null })
        .eq("id", tenantId);
    }
  });
});
