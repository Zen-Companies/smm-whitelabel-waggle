import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callTool, toolByName, type McpPrincipal } from "@/features/mcp";
import { MockSocialProvider } from "@/lib/social/mock";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// MCP Phase 1 (docs/mcp/PLAN.md §3): the tools against the real schema. Zernio is the mock
// (rule 14). Tokens come in Phase 2; here the principal is built by hand, as the auth layer will.
const db = serviceClient();
const social = new MockSocialProvider();
const deps = { db, social: () => social };
const userIds: string[] = [];
const tenantIds: string[] = [];

async function signUp() {
  const { data, error } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  if (error) throw error;
  userIds.push(data.user!.id);
  return data.user!.id;
}

async function brand(userId: string, name: string, first: boolean) {
  const { data } = first
    ? await db.rpc("create_owner_tenant", { p_user_id: userId, p_name: name })
    : await db.rpc("create_brand", { p_user_id: userId, p_name: name });
  const tenantId = data![0].tenant_id as string;
  tenantIds.push(tenantId);
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
      platform: "facebook",
      username: name.toLowerCase().replace(/\W/g, ""),
    })
    .select("id")
    .single();
  return { tenantId, accountId: account!.id };
}

async function item(
  b: { tenantId: string; accountId: string },
  status: string,
  category: string,
  text = "Open on Sunday?",
) {
  const id = randomUUID();
  const { error } = await db.from("inbound_items").insert({
    id,
    tenant_id: b.tenantId,
    social_account_id: b.accountId,
    kind: "comment",
    zernio_comment_id: `c_${id}`,
    zernio_post_id: "post_1",
    author_name: "carlo",
    text,
    received_at: new Date().toISOString(),
    status,
    category,
    confidence: 0.9,
  });
  if (error) throw error;
  return id;
}

const call = async (p: McpPrincipal, name: string, args: Record<string, unknown>) => {
  const r = await callTool(toolByName(name)!, deps, p, args);
  return r.isError
    ? { error: JSON.parse(r.content[0].text).error as string }
    : (r.structuredContent as Record<string, unknown>);
};

let maria: string;
let cafe: { tenantId: string; accountId: string };
let florist: { tenantId: string; accountId: string };
let other: { tenantId: string; accountId: string };
let claude: McpPrincipal;

beforeAll(async () => {
  // The deployment's switch (MCP_ENABLED); brands are switched on one by one below.
  process.env.MCP_ENABLED = "true";
  maria = await signUp();
  cafe = await brand(maria, "Harbour Bean Cafe", true);
  florist = await brand(maria, "Bloom and Stem", false);
  other = await brand(await signUp(), "Someone Else", true);
  // Maria ticked only the café for Claude.
  claude = {
    userId: maria,
    clientId: "client_claude",
    clientName: "Claude",
    brandIds: [cafe.tenantId],
  };
  // AI assistants on for the café only (Phase 3 switches; the florist stays off).
  await db.from("feature_flags").insert({ key: "mcp", tenant_id: cafe.tenantId, enabled: true });
  await db.from("kb_entries").insert([
    { tenant_id: cafe.tenantId, title: "Sunday hours", content: "Open 8am to 10pm on Sundays." },
    { tenant_id: cafe.tenantId, title: "Parking", content: "Free parking behind the shop." },
  ]);
});

afterAll(async () => {
  for (const id of tenantIds) await db.from("tenants").delete().eq("id", id);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("brands: only the ticked brands of the signed-in owner", () => {
  it("list_brands shows the ticked brand only", async () => {
    const out = (await call(claude, "list_brands", {})) as {
      brands: { brand_id: string; accounts: unknown[] }[];
    };
    expect(out.brands.map((b) => b.brand_id)).toEqual([cafe.tenantId]);
    expect(out.brands[0].accounts).toHaveLength(1);
  });

  it("an unticked brand of the same owner, or someone else's, is refused", async () => {
    expect(await call(claude, "list_inbox", { brand_id: florist.tenantId })).toEqual({
      error: "brand_not_allowed",
    });
    expect(await call(claude, "list_inbox", { brand_id: other.tenantId })).toEqual({
      error: "brand_not_allowed",
    });
    // Even if a grant listed it, the owner must still be a member.
    const forged = { ...claude, brandIds: [other.tenantId] };
    expect(await call(forged, "list_inbox", { brand_id: other.tenantId })).toEqual({
      error: "brand_not_allowed",
    });
  });

  it("another brand's message can't be opened through this brand", async () => {
    const theirs = await item(other, "awaiting_approval", "faq");
    expect(
      await call(claude, "get_conversation", { brand_id: cafe.tenantId, item_id: theirs }),
    ).toEqual({ error: "not_found" });
  });
});

describe("the owner's own reply to a handed-over complaint (Q1)", () => {
  it("write_reply → sending, then undo, then approve again", async () => {
    const id = await item(cafe, "escalated", "complaint", "My latte was cold!");
    const convo = (await call(claude, "get_conversation", { item_id: id })) as {
      customer_text: string;
      can: { write_reply: boolean; approve_reply: boolean };
    };
    expect(convo.customer_text).toBe("My latte was cold!");
    expect(convo.can).toMatchObject({ write_reply: true, approve_reply: false });

    const sent = (await call(claude, "write_reply", {
      item_id: id,
      body: "So sorry! Your next latte is on us.",
    })) as { status: string; draft_id: string };
    expect(sent.status).toBe("sending");
    const { data: draft } = await db
      .from("drafts")
      .select("status, owner_written, decided_by")
      .eq("id", sent.draft_id)
      .single();
    expect(draft).toEqual({ status: "approved", owner_written: true, decided_by: maria });
    const { data: audit } = await db
      .from("audit_log")
      .select("details")
      .eq("item_id", id)
      .eq("action", "owner_reply_written")
      .single();
    expect(audit?.details).toMatchObject({
      via: { mcpClientId: "client_claude", clientName: "Claude" },
    });

    expect(await call(claude, "undo_reply", { item_id: id, draft_id: sent.draft_id })).toEqual({
      undone: true,
    });
    const back = (await db.from("inbound_items").select("status").eq("id", id).single()).data;
    expect(back?.status).toBe("awaiting_approval");

    const again = (await call(claude, "approve_reply", {
      item_id: id,
      draft_id: sent.draft_id,
    })) as { status: string };
    expect(again.status).toBe("sending");
    // A second write on a message already going out is refused.
    expect(await call(claude, "write_reply", { item_id: id, body: "Hi" })).toEqual({
      error: "already_decided",
    });
  });

  it("list_inbox pages the For you tab, customer text marked as customer_*", async () => {
    // Inbox by sender: a reply waiting for approval shows once its draft exists (as in the app),
    // so the row here is one handed to the owner.
    await item(cafe, "escalated", "unclear");
    const out = (await call(claude, "list_inbox", { tab: "for_you" })) as {
      items: { customer_text: string }[];
      counts: { for_you: number };
    };
    expect(out.items.length).toBeGreaterThan(0);
    expect(out.counts.for_you).toBe(out.items.length);
    expect(out.items[0]).toHaveProperty("customer_text");
  });
});

describe("business info, posts", () => {
  it("search_knowledge finds by keyword, never another brand's facts", async () => {
    const out = (await call(claude, "search_knowledge", { query: "sunday" })) as {
      entries: { title: string }[];
    };
    expect(out.entries.map((e) => e.title)).toEqual(["Sunday hours"]);
    const all = (await call(claude, "search_knowledge", {})) as { entries: unknown[] };
    expect(all.entries).toHaveLength(2);
  });

  it("posting: preview first, then the owner's yes; only this brand's accounts", async () => {
    expect(
      await call(claude, "preview_post", { content: "Hi", account_ids: [florist.accountId] }),
    ).toEqual({ error: "invalid_input" });
    expect(
      await call(claude, "preview_post", {
        content: "Hi",
        account_ids: [cafe.accountId],
        publish_at: "today 11:30am",
      }),
    ).toEqual({ error: "invalid_input" });
    const at = new Date(Date.now() + 3 * 60 * 60_000).toISOString();
    const preview = (await call(claude, "preview_post", {
      content: "Ube pandesal this Saturday",
      account_ids: [cafe.accountId],
      media: [{ url: "https://cdn.example.com/pandesal.jpg" }],
      publish_at: at,
    })) as {
      confirmation: string;
      preview: { media: { type: string }[]; publish: { mode: string } };
    };
    expect(preview.preview.media[0].type).toBe("image");
    expect(preview.preview.publish.mode).toBe("at");
    // Nothing is posted by a preview.
    const before = (await call(claude, "list_posts", { show: "upcoming" })) as {
      posts: unknown[];
    };
    const made = (await call(claude, "create_post", {
      confirmation: preview.confirmation,
    })) as { post_id: string; outcome: string };
    expect(["scheduled", "waiting"]).toContain(made.outcome);
    const listed = (await call(claude, "list_posts", { show: "upcoming" })) as {
      posts: { post_id: string; content: string }[];
    };
    expect(listed.posts).toHaveLength(before.posts.length + 1);
    expect(listed.posts.find((p) => p.post_id === made.post_id)?.content).toBe(
      "Ube pandesal this Saturday",
    );
    // A confirmation posts once.
    expect(await call(claude, "create_post", { confirmation: preview.confirmation })).toEqual({
      error: "already_decided",
    });
    expect(await call(claude, "cancel_post", { post_id: made.post_id })).toEqual({
      cancelled: true,
    });
  });

  it("a confirmation only works for the assistant that asked, and not after 30 minutes", async () => {
    const preview = (await call(claude, "preview_post", {
      content: "Fresh ensaymada",
      account_ids: [cafe.accountId],
      publish_at: "queue",
    })) as { confirmation: string };
    const otherAssistant = { ...claude, clientId: "client_chatgpt", clientName: "ChatGPT" };
    expect(
      await call(otherAssistant, "create_post", { confirmation: preview.confirmation }),
    ).toEqual({ error: "invalid_input" });
    await db
      .from("post_previews")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", preview.confirmation);
    expect(await call(claude, "create_post", { confirmation: preview.confirmation })).toEqual({
      error: "invalid_input",
    });
  });

  it("a media link that isn't a file is refused before anything is saved", async () => {
    expect(
      await call(claude, "preview_post", {
        content: "Our new menu",
        account_ids: [cafe.accountId],
        media: [{ url: "https://dropbox.example/webpage/menu.jpg" }],
      }),
    ).toEqual({ error: "invalid_input" });
    expect(
      await call(claude, "preview_post", {
        content: "Our new menu",
        account_ids: [cafe.accountId],
        media: [{ url: "http://cdn.example.com/menu.jpg" }],
      }),
    ).toEqual({ error: "invalid_input" });
  });
});

describe("posting extras (17 Nov): options, photos added in Waggle, analytics platforms", () => {
  it("per-platform options are stored with the preview and checked against the accounts", async () => {
    expect(
      await call(claude, "preview_post", {
        content: "Weekend special",
        account_ids: [cafe.accountId],
        options: [{ platform: "instagram", post_type: "reel" }],
      }),
    ).toEqual({ error: "invalid_input" });
    const p = (await call(claude, "preview_post", {
      content: "Weekend special",
      account_ids: [cafe.accountId],
      options: [{ platform: "facebook", post_type: "reel", first_comment: "Menu in bio" }],
      publish_at: "queue",
    })) as { confirmation: string; preview: { options: Record<string, unknown> } };
    expect(p.preview.options).toEqual({ facebook: { as: "reel", firstComment: "Menu in bio" } });
    const { data } = await db
      .from("post_previews")
      .select("options")
      .eq("id", p.confirmation)
      .single();
    expect(data!.options).toEqual({ facebook: { as: "reel", firstComment: "Menu in bio" } });
  });

  it("an upload link: empty until the owner adds files, then its files go in the preview", async () => {
    const link = (await call(claude, "create_upload_link", {})) as {
      upload_id: string;
      upload_url: string;
    };
    expect(link.upload_url.endsWith(`/add-photos/${link.upload_id}`)).toBe(true);
    expect(
      await call(claude, "preview_post", {
        content: "From the oven",
        account_ids: [cafe.accountId],
        upload_id: link.upload_id,
      }),
    ).toEqual({ error: "invalid_input" });
    // What the page records after each browser upload.
    await db
      .from("media_uploads")
      .update({
        files: [
          {
            url: "https://media.zernio.com/temp/oven.jpg",
            type: "image",
            name: "oven.jpg",
            size: 1000,
          },
        ],
      })
      .eq("id", link.upload_id);
    const p = (await call(claude, "preview_post", {
      content: "From the oven",
      account_ids: [cafe.accountId],
      upload_id: link.upload_id,
    })) as { preview: { media: { url: string; type: string }[] } };
    expect(p.preview.media).toEqual([
      expect.objectContaining({ url: "https://media.zernio.com/temp/oven.jpg", type: "image" }),
    ]);
    // Another assistant can't use it.
    expect(
      await call({ ...claude, clientId: "client_grok" }, "preview_post", {
        content: "From the oven",
        account_ids: [cafe.accountId],
        upload_id: link.upload_id,
      }),
    ).toEqual({ error: "invalid_input" });
  });

  it("analytics take any connected platform, and say which when it isn't one", async () => {
    expect(await call(claude, "get_analytics", { platform: "facebook" })).toHaveProperty("section");
    expect(await call(claude, "get_analytics", { platform: "tiktok" })).toEqual({
      error: "invalid_input",
    });
    expect(await call(claude, "get_post_performance", { platform: "tiktok" })).toEqual({
      error: "invalid_input",
    });
  });
});

describe("Teach Waggle answers and leads (17 Nov)", () => {
  it("add an answer, refuse the same question twice, change it", async () => {
    const added = (await call(claude, "add_answer", {
      question: "Do you deliver?",
      answer: "Yes, within 5 km, free over $20.",
    })) as { entry_id: string };
    expect(added.entry_id).toBeTruthy();
    expect(
      await call(claude, "add_answer", { question: "do you deliver?", answer: "Maybe" }),
    ).toEqual({ error: "invalid_input" });
    expect(
      await call(claude, "update_answer", {
        entry_id: added.entry_id,
        question: "Do you deliver?",
        answer: "Yes, within 8 km, free over $25.",
      }),
    ).toEqual({ entry_id: added.entry_id, title: "Do you deliver?" });
    const { data } = await db
      .from("kb_entries")
      .select("content, embedding")
      .eq("id", added.entry_id)
      .single();
    // Saved now; the jobs route embeds it later (no AI call from the assistant's tool).
    expect(data).toEqual({ content: "Yes, within 8 km, free over $25.", embedding: null });
    const { data: audit } = await db
      .from("audit_log")
      .select("action, details")
      .eq("tenant_id", cafe.tenantId)
      .in("action", ["kb_entry_created", "kb_entry_updated"]);
    expect(audit!.length).toBeGreaterThanOrEqual(2);
    expect(audit!.every((a) => !!(a.details as { via?: unknown }).via)).toBe(true);
    expect(
      await call(claude, "update_answer", {
        entry_id: randomUUID(),
        question: "Parking?",
        answer: "Behind the shop.",
      }),
    ).toEqual({ error: "not_found" });
  });

  it("list leads by stage and move one, this brand's only", async () => {
    const itemId = await item(cafe, "drafted", "lead", "Can I book a table for 8 on Friday?");
    const { data: lead } = await db
      .from("leads")
      .insert({
        tenant_id: cafe.tenantId,
        item_id: itemId,
        name: "Ana",
        request: "Table for 8, Friday",
      })
      .select("id")
      .single();
    const listed = (await call(claude, "list_leads", {})) as {
      leads: { lead_id: string; stage: string; customer_wants: string | null }[];
    };
    expect(listed.leads.find((l) => l.lead_id === lead!.id)).toMatchObject({
      customer_wants: "Table for 8, Friday",
    });
    expect(await call(claude, "move_lead", { lead_id: lead!.id, stage: "booked" })).toEqual({
      lead_id: lead!.id,
      stage: "booked",
    });
    const booked = (await call(claude, "list_leads", { stage: "booked" })) as {
      leads: { lead_id: string }[];
    };
    expect(booked.leads.map((l) => l.lead_id)).toContain(lead!.id);
    expect(await call(claude, "move_lead", { lead_id: randomUUID(), stage: "done" })).toEqual({
      error: "not_found",
    });
  });
});

describe("Add photos: only links Waggle handed out are saved (security review)", () => {
  it("issued, once, capped", async () => {
    const link = (await call(claude, "create_upload_link", {})) as { upload_id: string };
    const file = (url: string) => ({ url, type: "image", name: "a.jpg", size: 1 });
    const ours = "https://media.zernio.com/temp/ours.jpg";
    // Not issued for this upload: refused (e.g. another tenant's media link).
    expect(
      (
        await db.rpc("media_upload_add_file", {
          p_id: link.upload_id,
          p_file: file(ours),
          p_max: 10,
        })
      ).data,
    ).toBe(false);
    expect(
      (await db.rpc("media_upload_issue", { p_id: link.upload_id, p_url: ours, p_max: 2 })).data,
    ).toBe(true);
    expect(
      (
        await db.rpc("media_upload_add_file", {
          p_id: link.upload_id,
          p_file: file(ours),
          p_max: 10,
        })
      ).data,
    ).toBe(true);
    // Twice: no.
    expect(
      (
        await db.rpc("media_upload_add_file", {
          p_id: link.upload_id,
          p_file: file(ours),
          p_max: 10,
        })
      ).data,
    ).toBe(false);
    // The cap on links handed out.
    await db.rpc("media_upload_issue", {
      p_id: link.upload_id,
      p_url: "https://media.zernio.com/temp/b.jpg",
      p_max: 2,
    });
    expect(
      (
        await db.rpc("media_upload_issue", {
          p_id: link.upload_id,
          p_url: "https://media.zernio.com/temp/c.jpg",
          p_max: 2,
        })
      ).data,
    ).toBe(false);
  });
});

describe("MCP catch-up (27 Nov): change posts, inbox by sender, your week", () => {
  // Many actions in one brand within the hour: the limits are tested in mcp-limits.test.ts.
  const saved = { ...process.env };
  beforeAll(() => {
    process.env.MCP_ACTS_PER_HOUR = "500";
    process.env.MCP_BURST_SEND_CAP = "500";
    process.env.MCP_CALLS_PER_MINUTE = "1000";
  });
  afterAll(() => {
    for (const key of ["MCP_ACTS_PER_HOUR", "MCP_BURST_SEND_CAP", "MCP_CALLS_PER_MINUTE"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  async function plannedPost(content: string) {
    const preview = (await call(claude, "preview_post", {
      content,
      account_ids: [cafe.accountId],
      publish_at: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
    })) as { confirmation: string };
    const made = (await call(claude, "create_post", {
      confirmation: preview.confirmation,
    })) as { post_id: string };
    // As Zernio's answer leaves it: planned, held by Zernio.
    await db
      .from("posts")
      .update({ status: "scheduled", zernio_post_id: `mock_post_${made.post_id}` })
      .eq("id", made.post_id);
    return made.post_id;
  }

  it("move: preview, the owner's yes, once; a change confirmation isn't a new post", async () => {
    const postId = await plannedPost("Ube pandesal this Saturday");
    const to = new Date(Date.now() + 26 * 60 * 60_000);
    const preview = (await call(claude, "preview_post_move", {
      post_id: postId,
      publish_at: to.toISOString(),
    })) as { confirmation: string; move: { from: string; to: string } };
    expect(new Date(preview.move.to).getTime()).toBe(to.getTime());
    expect(await call(claude, "create_post", { confirmation: preview.confirmation })).toEqual({
      error: "invalid_input",
    });
    const done = (await call(claude, "apply_post_change", {
      confirmation: preview.confirmation,
    })) as { outcome: string; scheduled_for: string };
    expect(done.outcome).toBe("moved");
    const { data: row } = await db.from("posts").select("scheduled_for").eq("id", postId).single();
    expect(new Date(row!.scheduled_for!).getTime()).toBe(to.getTime());
    expect(await call(claude, "apply_post_change", { confirmation: preview.confirmation })).toEqual(
      { error: "already_decided" },
    );
    const { data: audit } = await db
      .from("audit_log")
      .select("details")
      .eq("tenant_id", cafe.tenantId)
      .eq("action", "post_moved")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect((audit!.details as { via?: { clientName?: string } }).via?.clientName).toBe("Claude");
  });

  it("edit: only what changes; a new post's confirmation can't apply a change", async () => {
    const postId = await plannedPost("Fresh ensaymada tomorrow");
    expect(
      await call(claude, "preview_post_edit", {
        post_id: postId,
        content: "Fresh ensaymada tomorrow",
      }),
    ).toEqual({ error: "invalid_input" });
    const preview = (await call(claude, "preview_post_edit", {
      post_id: postId,
      content: "Fresh ensaymada tomorrow, from 7am",
    })) as { confirmation: string; changes: string[]; preview: { content: string } };
    expect(preview.changes).toEqual(["text"]);
    expect(preview.preview.content).toBe("Fresh ensaymada tomorrow, from 7am");
    const done = (await call(claude, "apply_post_change", {
      confirmation: preview.confirmation,
    })) as { outcome: string; changed: string[] };
    expect(done).toMatchObject({ outcome: "updated", changed: ["text"] });
    const { data: row } = await db.from("posts").select("content").eq("id", postId).single();
    expect(row!.content).toBe("Fresh ensaymada tomorrow, from 7am");

    const newPost = (await call(claude, "preview_post", {
      content: "Another one",
      account_ids: [cafe.accountId],
      publish_at: "queue",
    })) as { confirmation: string };
    expect(await call(claude, "apply_post_change", { confirmation: newPost.confirmation })).toEqual(
      { error: "invalid_input" },
    );
  });

  it("fix the text of a live post; a planned one is refused", async () => {
    const postId = await plannedPost("Open till 9pm tonight");
    expect(
      await call(claude, "preview_text_fix", { post_id: postId, content: "Open till 10pm" }),
    ).toEqual({ error: "invalid_input" });
    const { data: acc } = await db
      .from("social_accounts")
      .select("zernio_account_id")
      .eq("id", cafe.accountId)
      .single();
    await db
      .from("posts")
      .update({
        status: "published",
        platform_results: [
          { platform: "facebook", status: "published", accountId: acc!.zernio_account_id },
        ],
      })
      .eq("id", postId);
    const preview = (await call(claude, "preview_text_fix", {
      post_id: postId,
      content: "Open till 10pm tonight",
    })) as { confirmation: string; fix: { changes_on: string[]; stays_on: string[] } };
    expect(preview.fix).toMatchObject({ changes_on: ["facebook"], stays_on: [] });
    const done = (await call(claude, "apply_post_change", {
      confirmation: preview.confirmation,
    })) as { outcome: string; fixed_on: string[] };
    expect(done).toMatchObject({ outcome: "fixed", fixed_on: ["facebook"] });
    expect(social.edited.at(-1)).toMatchObject({ content: "Open till 10pm tonight" });
  });

  it("duplicate: a new preview from a post, posted with create_post", async () => {
    const postId = await plannedPost("Weekend brunch is back");
    const dup = (await call(claude, "duplicate_post", {
      post_id: postId,
      publish_at: "queue",
    })) as { confirmation: string; preview: { content: string } };
    expect(dup.preview.content).toBe("Weekend brunch is back");
    const made = (await call(claude, "create_post", { confirmation: dup.confirmation })) as {
      post_id: string;
    };
    expect(made.post_id).not.toBe(postId);
    expect(
      await call(claude, "duplicate_post", { post_id: randomUUID(), publish_at: "queue" }),
    ).toEqual({ error: "not_found" });
  });

  it("list_inbox: one row per sender; get_conversation: all their messages", async () => {
    const first = randomUUID();
    const second = randomUUID();
    for (const [id, minutesAgo] of [
      [first, 30],
      [second, 5],
    ] as const) {
      const { error } = await db.from("inbound_items").insert({
        id,
        tenant_id: cafe.tenantId,
        social_account_id: cafe.accountId,
        kind: "comment",
        zernio_comment_id: `c_${id}`,
        zernio_post_id: "post_9",
        author_name: "dana_r",
        text: minutesAgo === 30 ? "The latte was cold." : "Still waiting for an answer.",
        received_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
        status: "escalated",
        category: "complaint",
        confidence: 0.9,
      });
      if (error) throw error;
    }
    const out = (await call(claude, "list_inbox", { tab: "for_you" })) as {
      items: { item_id: string; customer_name: string; messages: number; group: string }[];
    };
    const dana = out.items.filter((i) => i.customer_name === "dana_r");
    expect(dana).toHaveLength(1);
    expect(dana[0]).toMatchObject({ item_id: second, messages: 2, group: "now" });
    // Complaints come first.
    expect(out.items[0].group).toBe("now");
    const onlyComplaints = (await call(claude, "list_inbox", { status: ["complaints"] })) as {
      items: { customer_name: string }[];
    };
    expect(onlyComplaints.items.some((i) => i.customer_name === "dana_r")).toBe(true);
    const convo = (await call(claude, "get_conversation", { item_id: second })) as {
      thread: { from: string; item_id: string }[];
    };
    expect(convo.thread.filter((m) => m.from === "customer").map((m) => m.item_id)).toEqual([
      first,
      second,
    ]);
  });

  it("your week: nothing yet, Check now once a day, then the stored numbers", async () => {
    const empty = (await call(claude, "get_week", {})) as {
      latest: unknown;
      check_now: { available: boolean };
    };
    expect(empty).toMatchObject({ latest: null, check_now: { available: true } });
    expect(await call(claude, "run_week_check", {})).toMatchObject({ outcome: "queued" });
    expect(await call(claude, "run_week_check", {})).toMatchObject({
      outcome: "already_running",
    });
    // The run finishes (the job does this; here by hand, with a stored summary).
    await db
      .from("weekly_checks")
      .update({
        status: "done",
        finished_at: new Date().toISOString(),
        summary: {
          cameIn: 12,
          answeredByWaggle: 8,
          answeredByYou: 2,
          waiting: 2,
          closingToday: 0,
          found: 1,
          tooOld: 0,
          previousCameIn: null,
          accounts: [
            {
              id: cafe.accountId,
              platform: "facebook",
              name: "Harbour Bean",
              state: "read",
              reason: null,
              count: 12,
            },
          ],
          topics: [{ topic: "hours", label: "Opening hours", count: 4 }],
          gaps: [{ text: "Do you have oat milk?", times: 2 }],
        },
      })
      .eq("tenant_id", cafe.tenantId)
      .in("status", ["queued", "running"]);
    expect(await call(claude, "run_week_check", {})).toMatchObject({ outcome: "limited" });
    const week = (await call(claude, "get_week", {})) as {
      latest: {
        numbers: { came_in: number };
        uncovered_questions: { customer_question: string }[];
      };
      check_now: { available: boolean };
    };
    expect(week.latest.numbers.came_in).toBe(12);
    expect(week.latest.uncovered_questions[0].customer_question).toBe("Do you have oat milk?");
    expect(week.check_now.available).toBe(false);
  });
});
