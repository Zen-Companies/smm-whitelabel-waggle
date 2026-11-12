import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeTemplateReply } from "@/features/approvals/decisions";
import { createSendStep } from "@/features/approvals/send-step";
import { processDueItems } from "@/features/inbox/processor";
import { createTemplateFor } from "@/features/whatsapp";
import { createDeadline } from "@/lib/jobs";
import { MockSocialProvider } from "@/lib/social/mock";
import { anonClient, claimFor, serviceClient, uniqueEmail } from "./helpers";

// T67: after WhatsApp's 24-hour window the owner restarts the chat with an approved template.
// It goes through the same draft → policy() → send step as every reply (rule 6).
class CapturingSocial extends MockSocialProvider {
  dms: Parameters<MockSocialProvider["sendDm"]>[0][] = [];
  override async sendDm(input: Parameters<MockSocialProvider["sendDm"]>[0]) {
    this.dms.push(input);
    return super.sendDm(input);
  }
}

const db = serviceClient();
const social = new CapturingSocial();
let tenantId: string;
let userId: string;
let accountId: string;
let zernioAccountId: string;

const run = () =>
  processDueItems({
    db,
    steps: { sending: createSendStep({ social: () => social }) },
    deadline: createDeadline(),
    claim: claimFor(() => tenantId),
  });

/** A WhatsApp DM handed to the owner, its window long closed. */
async function closedChat(author = "Ana Reyes") {
  const { data: conv } = await db
    .from("conversations")
    .insert({
      tenant_id: tenantId,
      social_account_id: accountId,
      zernio_conversation_id: `conv_${randomUUID()}`,
      platform: "whatsapp",
      last_customer_message_at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();
  const itemId = randomUUID();
  const { error } = await db.from("inbound_items").insert({
    id: itemId,
    tenant_id: tenantId,
    social_account_id: accountId,
    kind: "dm",
    zernio_message_id: `m_${itemId}`,
    conversation_id: conv!.id,
    author_name: author,
    text: "Can I still order the cake for Saturday?",
    received_at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    status: "escalated",
    category: "lead",
    confidence: 0.9,
  });
  if (error) throw error;
  return itemId;
}

const templateId = async (name: string) =>
  (await social.listWhatsAppTemplates({ accountId: zernioAccountId })).find((t) => t.name === name)!
    .id;

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userId = data.user!.id;
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "WhatsApp Cafe",
  });
  tenantId = rows![0].tenant_id;
  await db.from("tenants").update({ subscription_status: "active" }).eq("id", tenantId);
  zernioAccountId = `acc_wa_${randomUUID().slice(0, 8)}`;
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: zernioAccountId,
      platform: "whatsapp",
      username: "+63 917 000 4410",
    })
    .select("id")
    .single();
  accountId = account!.id;
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  await db.auth.admin.deleteUser(userId);
});

describe("WhatsApp templates (T67)", () => {
  it("an approved template restarts the chat: draft → policy → sent as a template", async () => {
    const itemId = await closedChat();
    const r = await writeTemplateReply(
      { db, social },
      { tenantId, userId, itemId, templateId: await templateId("follow_up") },
    );
    expect(r).toMatchObject({ ok: true });

    const { data: draft } = await db
      .from("drafts")
      .select("body, template, owner_written, status")
      .eq("item_id", itemId)
      .single();
    expect(draft).toMatchObject({
      template: { name: "follow_up", language: "en", params: ["Ana"] },
      owner_written: true,
      status: "approved",
    });
    expect(draft!.body).toMatch(/^Hi Ana, thanks for your message!/);

    // As if the undo window had passed.
    await db.from("inbound_items").update({ next_run_at: null }).eq("id", itemId);
    await run();
    const { data: item } = await db
      .from("inbound_items")
      .select("status")
      .eq("id", itemId)
      .single();
    expect(item?.status).toBe("sent");
    expect(social.dms.at(-1)).toMatchObject({
      accountId: zernioAccountId,
      template: { name: "follow_up", language: "en", params: ["Ana"] },
    });
  });

  it("refuses a template Meta hasn't approved, and non-WhatsApp chats", async () => {
    const itemId = await closedChat();
    await expect(
      writeTemplateReply(
        { db, social },
        { tenantId, userId, itemId, templateId: await templateId("weekend_promo") },
      ),
    ).resolves.toEqual({ ok: false, error: "template_not_ready" });
  });

  it("a phone number as the name becomes 'there'", async () => {
    const itemId = await closedChat("+63 917 555 0000");
    await writeTemplateReply(
      { db, social },
      { tenantId, userId, itemId, templateId: await templateId("follow_up") },
    );
    const { data: draft } = await db
      .from("drafts")
      .select("template")
      .eq("item_id", itemId)
      .single();
    expect(draft?.template).toMatchObject({ params: ["there"] });
  });

  it("Settings: a new template goes to Meta for review; the same name twice is refused", async () => {
    const input = {
      tenantId,
      actor: userId,
      label: "Order ready for pickup",
      kind: "update" as const,
      text: "Hi [name], your order is ready for pickup!",
    };
    await expect(createTemplateFor({ db, social }, input)).resolves.toEqual({
      ok: true,
      name: "order_ready_for_pickup",
    });
    const created = (await social.listWhatsAppTemplates({ accountId: zernioAccountId })).find(
      (t) => t.name === "order_ready_for_pickup",
    );
    expect(created).toMatchObject({
      status: "PENDING",
      category: "UTILITY",
      body: "Hi {{1}}, your order is ready for pickup!",
    });
    await expect(createTemplateFor({ db, social }, input)).resolves.toEqual({
      ok: false,
      error: "name_taken",
    });
  });
});
