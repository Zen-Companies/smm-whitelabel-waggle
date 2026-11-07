/**
 * Demo mode: fills the local demo tenant (Harbour Bean Café, owner@example.com / password123 from
 * supabase/seed.sql) with a realistic mix, so the whole app can be clicked through with
 * SOCIAL_PROVIDER_MODE=mock and no external calls.
 *
 *   pnpm demo:seed
 *
 * Replaces the demo tenant's activity (messages, drafts, leads, posts, accounts, alerts,
 * notifications, AI cost rows, history) and nothing else; the business info (demo_kb.sql) is
 * kept. Messages go through the real status transitions, so history, alerts and notifications
 * come from the same triggers the app uses; only their times are moved into the past.
 * Refuses anything but a local Supabase.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { transitionItem, type ItemStatus, type StatusEvent } from "@/features/inbox/status";
import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: use the environment as is.
}

const TENANT = "10000000-0000-4000-8000-000000000001";
const OWNER = "00000000-0000-4000-8000-000000000001";
const MIN = 60_000;
const ago = (minutes: number) => new Date(Date.now() - minutes * MIN);

type Scenario =
  | "waiting"
  | "waiting_lead"
  | "sent"
  | "sent_lead"
  | "auto_sent"
  | "complaint"
  | "unclear"
  | "needs_human"
  | "window_closed"
  | "handled"
  | "spam";

interface Message {
  scenario: Scenario;
  kind: "comment" | "dm";
  account: "ig" | "fb";
  author: string;
  text: string;
  minutesAgo: number;
  category: "faq" | "lead" | "complaint" | "unclear" | "spam";
  confidence: number;
  reply?: string;
  facts?: string[];
  lead?: { name: string | null; contact: string | null; request: string };
  needsHumanReason?: string;
}

const MESSAGES: Message[] = [
  // Waiting for the owner's OK.
  {
    scenario: "waiting",
    kind: "comment",
    account: "ig",
    author: "mika.reyes",
    text: "What time do you open on Sundays? 🥐",
    minutesAgo: 12,
    category: "faq",
    confidence: 0.96,
    reply: "Hi Mika! On Sundays we're open 8:00am to 10:00pm, see you soon ☕",
    facts: ["Opening hours"],
  },
  {
    scenario: "waiting",
    kind: "dm",
    account: "ig",
    author: "Bea Santos",
    text: "Hello po! Pwede po ba magdala ng sariling cake? May corkage po ba?",
    minutesAgo: 41,
    category: "faq",
    confidence: 0.93,
    reply:
      "Hi Bea! Yes po, you can bring your own birthday cake for a ₱300 cake corkage fee. Other outside food and drinks aren't allowed. Happy birthday in advance!",
    facts: ["Outside food and corkage"],
  },
  {
    scenario: "waiting",
    kind: "comment",
    account: "fb",
    author: "Paolo Cruz",
    text: "Tumatanggap kayo ng GCash?",
    minutesAgo: 95,
    category: "faq",
    confidence: 0.95,
    reply: "Hi Paolo! Yes po, we accept GCash and Maya, plus cash and Visa/Mastercard.",
    facts: ["Payments"],
  },
  {
    scenario: "waiting_lead",
    kind: "dm",
    account: "ig",
    author: "Carlo Mendoza",
    text: "Hi! Can I reserve a table for 8 this Saturday at 7pm? It's for my mom's birthday. Carlo, 0917 555 0101",
    minutesAgo: 25,
    category: "lead",
    confidence: 0.94,
    reply:
      "Hi Carlo! Happy birthday to your mom! We take reservations for groups of 6 or more, so a table for 8 on Saturday at 7pm works. Our team will confirm by DM shortly.",
    facts: ["Reservations"],
    lead: {
      name: "Carlo Mendoza",
      contact: "0917 555 0101",
      request: "Table for 8, Saturday 7pm (birthday)",
    },
  },
  // Needs the owner.
  {
    scenario: "complaint",
    kind: "comment",
    account: "ig",
    author: "jen.dc",
    text: "Ang tagal ng order namin kanina, halos isang oras. Tapos malamig na yung kape. 😞",
    minutesAgo: 70,
    category: "complaint",
    confidence: 0.92,
  },
  {
    scenario: "unclear",
    kind: "dm",
    account: "fb",
    author: "Rico Villanueva",
    text: "Yung sa Friday ba tuloy?",
    minutesAgo: 180,
    category: "unclear",
    confidence: 0.48,
  },
  {
    scenario: "needs_human",
    kind: "comment",
    account: "ig",
    author: "aisha.k",
    text: "Is your kitchen halal certified?",
    minutesAgo: 240,
    category: "faq",
    confidence: 0.91,
    reply: "Good question! Our team will get back to you on this shortly.",
    needsHumanReason: "Halal certification isn't in the business info",
  },
  {
    scenario: "window_closed",
    kind: "dm",
    account: "ig",
    author: "Liza Tan",
    text: "Do you still have the ube latte? I want to order 3 for pickup.",
    minutesAgo: 26 * 60,
    category: "faq",
    confidence: 0.9,
    reply:
      "Hi Liza! The ube latte is on the menu all day. Just order at the counter or on GrabFood.",
    facts: ["Coffee menu and prices"],
  },
  // Already answered.
  {
    scenario: "sent_lead",
    kind: "comment",
    account: "fb",
    author: "Ana Gomez",
    text: "Pa-quote po for catering, 60 pax, company party sa Dec 12. Pls DM me",
    minutesAgo: 22 * 60,
    category: "lead",
    confidence: 0.95,
    reply:
      "Hi Ana! Thanks for thinking of us, we've sent you a DM to talk through the catering for your party.",
    facts: ["Catering and coffee cart"],
    lead: {
      name: "Ana Gomez",
      contact: null,
      request: "Catering quote, 60 pax, company party Dec 12",
    },
  },
  {
    scenario: "sent",
    kind: "comment",
    account: "ig",
    author: "kenji.o",
    text: "May oat milk po ba kayo?",
    minutesAgo: 5 * 60,
    category: "faq",
    confidence: 0.94,
    reply: "Hi Kenji! Yes po, oat milk is available for +₱30 on any drink.",
    facts: ["Coffee menu and prices"],
  },
  {
    scenario: "auto_sent",
    kind: "comment",
    account: "ig",
    author: "trish.m",
    text: "May parking po ba?",
    minutesAgo: 3 * 60,
    category: "faq",
    confidence: 0.97,
    reply: "Hi Trish! Yes po, there's free parking for 8 cars right in front of the café.",
    facts: ["Location and parking"],
  },
  {
    scenario: "auto_sent",
    kind: "comment",
    account: "fb",
    author: "Joel Ramos",
    text: "Do you have wifi? Planning to work there tomorrow",
    minutesAgo: 2 * 60,
    category: "faq",
    confidence: 0.96,
    reply:
      "Hi Joel! Free Wi-Fi for customers (the password is on your receipt), and there are power outlets along the window bar.",
    facts: ["Pets, Wi-Fi and amenities"],
  },
  {
    scenario: "handled",
    kind: "dm",
    account: "ig",
    author: "Marco Lim",
    text: "I left my umbrella there yesterday, blue one. Nakita niyo po ba?",
    minutesAgo: 20 * 60,
    category: "unclear",
    confidence: 0.55,
  },
  {
    scenario: "spam",
    kind: "dm",
    account: "ig",
    author: "growth.guru.ph",
    text: "Hi! We can get your page 10k followers in 7 days for only ₱999. DM us now!",
    minutesAgo: 8 * 60,
    category: "spam",
    confidence: 0.97,
  },
];

const POSTS = [
  {
    content:
      "Ube cheese pandesal is back! 💜 Fresh every morning from 7am, ₱180 for a box of 6. See you at Aurora Blvd!",
    status: "published" as const,
    at: ago(26 * 60),
  },
  {
    content:
      "Weekend brunch is here ☀️ All-day breakfast plates and our iced Spanish latte, Saturday and Sunday from 8am.",
    status: "scheduled" as const,
    at: new Date(Date.now() + 18 * 60 * MIN),
  },
  {
    content:
      "Barista workshop this Saturday, 9am to 12nn. Learn latte art with our head barista. DM us to save a seat!",
    status: "failed" as const,
    at: ago(4 * 60),
  },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error(`refusing to seed ${url || "an unset URL"}: local Supabase only`);
  }
  if (process.env.SOCIAL_PROVIDER_MODE !== "mock") {
    console.log(
      "Note: SOCIAL_PROVIDER_MODE isn't mock in .env.local. Set it before clicking through the demo,\n" +
        "or approving a reply would call Zernio.\n",
    );
  }
  const db = createClient(url, key, {
    auth: { persistSession: false },
  }) as unknown as ServiceClient;

  const { data: tenant } = await db.from("tenants").select("id").eq("id", TENANT).maybeSingle();
  if (!tenant) throw new Error("Demo tenant missing: it comes from supabase/seed.sql.");

  // 1. Clear the demo tenant's activity (business info stays).
  for (const table of ["notifications", "alerts", "leads", "ai_usage", "audit_log"] as const) {
    const { error } = await db.from(table).delete().eq("tenant_id", TENANT);
    if (error) throw new Error(`clearing ${table} failed: ${error.message}`);
  }
  for (const table of ["posts", "inbound_items", "conversations", "social_accounts"] as const) {
    const { error } = await db.from(table).delete().eq("tenant_id", TENANT);
    if (error) throw new Error(`clearing ${table} failed: ${error.message}`);
  }
  // A placeholder profile id: logging in never creates a Zernio profile for the demo.
  await db
    .from("tenants")
    .update({
      name: "Harbour Bean Café",
      zernio_profile_id: "demo_profile_harbour_bean",
      subscription_status: "active",
      health_checked_at: new Date().toISOString(),
      // A test brand: staff can run MCP "Try it" on it (MCP Phase 4).
      is_test: true,
    })
    .eq("id", TENANT);
  await db
    .from("autonomy_settings")
    .update({ mode: "approve" })
    .eq("tenant_id", TENANT)
    .in("category", ["faq", "lead"]);

  // 2. Accounts.
  const { data: accounts, error: accErr } = await db
    .from("social_accounts")
    .insert([
      {
        tenant_id: TENANT,
        zernio_account_id: "demo_ig_harbourbean",
        platform: "instagram",
        username: "harbourbeancafe",
      },
      {
        tenant_id: TENANT,
        zernio_account_id: "demo_fb_harbourbean",
        platform: "facebook",
        username: "harbourbeancafe",
      },
    ])
    .select("id, platform");
  if (accErr) throw accErr;
  const accountId = {
    ig: accounts!.find((a) => a.platform === "instagram")!.id,
    fb: accounts!.find((a) => a.platform === "facebook")!.id,
  };
  const { data: kb } = await db.from("kb_entries").select("id, title").eq("tenant_id", TENANT);
  const kbId = new Map((kb ?? []).map((e) => [e.title, e.id]));

  // 3. Messages, each through its real status transitions.
  const counts: Record<string, number> = {};
  for (const m of MESSAGES) {
    await seedMessage(db, m, accountId, kbId);
    counts[m.scenario] = (counts[m.scenario] ?? 0) + 1;
  }

  // 4. Posts: published yesterday, scheduled tomorrow, one that failed during a Zernio pause.
  for (const p of POSTS) {
    const { data: post, error } = await db
      .from("posts")
      .insert({
        tenant_id: TENANT,
        content: p.content,
        target_account_ids: [accountId.ig, accountId.fb],
        scheduled_for: p.at.toISOString(),
        status: "scheduled",
        zernio_post_id: `mock_post_demo_${randomUUID().slice(0, 12)}`,
        created_at: new Date(p.at.getTime() - 2 * 60 * MIN).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    if (p.status === "published") {
      await db
        .from("posts")
        .update({
          status: "published",
          published_at: p.at.toISOString(),
          platform_results: [
            { platform: "instagram", status: "published", url: null, error: null },
            { platform: "facebook", status: "published", url: null, error: null },
          ] as unknown as Json,
        })
        .eq("id", post.id);
    } else if (p.status === "failed") {
      await db
        .from("posts")
        .update({
          status: "failed",
          failure_reason: "zernio_paused",
          last_error: "instagram: payment required; facebook: payment required",
        })
        .eq("id", post.id);
    }
    await db
      .from("notifications")
      .update({ created_at: p.at.toISOString(), updated_at: p.at.toISOString() })
      .eq("post_id", post.id);
  }

  const { count: notifications } = await db
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT);
  console.log("Harbour Bean Café demo is ready:");
  console.log(
    `  messages: ${MESSAGES.length} (${Object.entries(counts)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")})`,
  );
  console.log(
    `  posts: ${POSTS.length} · notifications: ${notifications} · accounts: Instagram + Facebook`,
  );
  console.log("  sign in at http://localhost:3000/login as owner@example.com / password123");
}

async function seedMessage(
  db: ServiceClient,
  m: Message,
  accountId: { ig: string; fb: string },
  kbId: Map<string, string>,
) {
  const receivedAt = ago(m.minutesAgo);
  const itemId = randomUUID();
  let conversationId: string | null = null;
  if (m.kind === "dm") {
    const { data, error } = await db
      .from("conversations")
      .insert({
        tenant_id: TENANT,
        social_account_id: accountId[m.account],
        zernio_conversation_id: `demo_conv_${itemId.slice(0, 12)}`,
        platform: m.account === "ig" ? "instagram" : "facebook",
        participant_name: m.author,
        last_customer_message_at: receivedAt.toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    conversationId = data.id;
  }
  const { error } = await db.from("inbound_items").insert({
    id: itemId,
    tenant_id: TENANT,
    social_account_id: accountId[m.account],
    kind: m.kind,
    ...(m.kind === "comment"
      ? { zernio_comment_id: `demo_c_${itemId.slice(0, 12)}`, zernio_post_id: "demo_post_1" }
      : { zernio_message_id: `demo_m_${itemId.slice(0, 12)}`, conversation_id: conversationId }),
    author_name: m.author,
    text: m.text,
    received_at: receivedAt.toISOString(),
    status: "new",
    category: m.category,
    confidence: m.confidence,
    classifier_used: "jev",
  });
  if (error) throw error;

  const audit = (action: string, details: Record<string, Json> = {}, actor = "system") =>
    db.from("audit_log").insert({ tenant_id: TENANT, item_id: itemId, action, actor, details });
  const move = async (from: ItemStatus, event: StatusEvent, details: Record<string, Json> = {}) => {
    const { applied } = await transitionItem(db, { itemId, from, event, details });
    if (!applied) throw new Error(`${m.author}: ${from} --${event}--> failed`);
  };
  // Illustrative production prices for the cost view (classifying with jevos costs nothing).
  const usage = (purpose: "classify" | "embed" | "draft") =>
    db.from("ai_usage").insert({
      tenant_id: TENANT,
      item_id: itemId,
      purpose,
      provider: purpose === "classify" ? "jev" : "openrouter",
      model:
        purpose === "classify"
          ? "jevos-v5"
          : purpose === "embed"
            ? "openai/text-embedding-3-small"
            : "openai/gpt-5-mini",
      input_tokens: purpose === "classify" ? 96 : purpose === "embed" ? 14 : 640,
      output_tokens: purpose === "draft" ? 86 : 0,
      cost_usd: purpose === "classify" ? 0 : purpose === "embed" ? 0.00000028 : 0.000332,
    });

  await audit("item_received", { kind: m.kind });
  await usage("classify");
  await move("new", "classified", {
    category: m.category,
    confidence: m.confidence,
    classifierUsed: "jev",
  });

  if (m.scenario === "spam") {
    await move("classified", "ignore", { decision: "ignore", policyReason: "spam" });
  } else if (["complaint", "unclear", "handled"].includes(m.scenario)) {
    await move("classified", "escalate", {
      decision: "escalate",
      policyReason: m.category === "complaint" ? "complaint" : "unclear",
    });
    if (m.scenario === "handled") await move("escalated", "handle", { handledBy: OWNER });
  } else {
    // Drafted from the business info.
    const factIds = (m.facts ?? []).flatMap((t) => kbId.get(t) ?? []);
    const { data: draft, error: dErr } = await db
      .from("drafts")
      .insert({
        tenant_id: TENANT,
        item_id: itemId,
        body: m.reply!,
        model: "openai/gpt-5-mini",
        kb_entry_ids: factIds,
        needs_human: !!m.needsHumanReason,
        needs_human_reason: m.needsHumanReason ?? null,
        created_at: new Date(receivedAt.getTime() + 30_000).toISOString(),
      })
      .select("id")
      .single();
    if (dErr) throw dErr;
    await usage("embed");
    await usage("draft");
    await audit("draft_created", {
      draftId: draft.id,
      needsHuman: !!m.needsHumanReason,
      promptVersion: "demo",
    });
    if (m.lead) {
      await db.from("leads").insert({ tenant_id: TENANT, item_id: itemId, ...m.lead });
      await audit("lead_captured", { draftId: draft.id });
    }
    await move("classified", "drafted", { draftId: draft.id });

    if (m.scenario === "needs_human") {
      await move("drafted", "escalate", {
        decision: "escalate",
        policyReason: "needs_human",
        draftId: draft.id,
      });
    } else if (m.scenario === "auto_sent") {
      await db
        .from("drafts")
        .update({ status: "approved", decided_at: receivedAt.toISOString() })
        .eq("id", draft.id);
      await audit("draft_auto_approved", { draftId: draft.id });
      await move("drafted", "send", {
        decision: "send",
        policyReason: "auto_send",
        mode: "auto",
        draftId: draft.id,
      });
      await sent(db, itemId, draft.id, receivedAt, audit, move);
    } else {
      await move("drafted", "await_approval", {
        decision: "approve",
        policyReason: "approval_required",
        mode: "approve",
        draftId: draft.id,
      });
      if (m.scenario === "sent" || m.scenario === "sent_lead" || m.scenario === "window_closed") {
        await db
          .from("drafts")
          .update({
            status: "approved",
            decided_by: OWNER,
            decided_at: new Date(receivedAt.getTime() + 20 * MIN).toISOString(),
          })
          .eq("id", draft.id);
        await audit("draft_approved", { draftId: draft.id, edited: false }, OWNER);
        await move("awaiting_approval", "send", { draftId: draft.id, decidedBy: OWNER });
        if (m.scenario === "window_closed") {
          // Approved after Instagram's 24-hour window closed: the send step stops it.
          await move("sending", "escalate", {
            decision: "escalate",
            policyReason: "dm_window_closed",
            draftId: draft.id,
          });
        } else {
          await sent(db, itemId, draft.id, receivedAt, audit, move);
        }
      }
    }
  }

  // Move the history into the past: in order, a few seconds to minutes after the message.
  const { data: rows } = await db
    .from("audit_log")
    .select("id")
    .eq("item_id", itemId)
    .order("created_at");
  for (const [i, row] of (rows ?? []).entries()) {
    const at = new Date(receivedAt.getTime() + (i < 4 ? i * 20_000 : 20 * MIN + (i - 4) * 15_000));
    await db.from("audit_log").update({ created_at: at.toISOString() }).eq("id", row.id);
  }
  const later = new Date(receivedAt.getTime() + 60_000).toISOString();
  await db.from("ai_usage").update({ created_at: later }).eq("item_id", itemId);
  await db.from("alerts").update({ created_at: later }).eq("item_id", itemId);
  await db
    .from("notifications")
    .update({
      created_at: later,
      updated_at: later,
      // Already dealt with: its notification was read.
      ...(m.scenario === "handled" ? { read_at: later } : {}),
    })
    .eq("item_id", itemId);
  await db.from("leads").update({ created_at: later }).eq("item_id", itemId);
}

/** The reply went out (through the mock): draft sent, item sent, reply_sent in the history. */
async function sent(
  db: ServiceClient,
  itemId: string,
  draftId: string,
  receivedAt: Date,
  audit: (action: string, details?: Record<string, Json>) => PromiseLike<unknown>,
  move: (from: ItemStatus, event: StatusEvent, details?: Record<string, Json>) => Promise<void>,
) {
  const providerId = `mock_comment_demo_${itemId.slice(0, 12)}`;
  await db
    .from("drafts")
    .update({
      status: "sent",
      sent_at: new Date(receivedAt.getTime() + 21 * MIN).toISOString(),
      zernio_reply_id: providerId,
    })
    .eq("id", draftId);
  await audit("reply_sent", { draftId, providerId, reconciled: false });
  await move("sending", "sent", { draftId, providerId });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
