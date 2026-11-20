"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { connectAccount } from "@/features/accounts";
import { sendAllReadyAction, updateAutonomyMode } from "@/features/approvals";
import { planAllowsAutoReply } from "@/features/billing";
import { redraftPulledItem } from "@/features/catch-up";
import { addAnswerNow } from "@/features/knowledge-base";
import { can } from "@/features/orgs";
import {
  BRAND_NAME_MAX,
  ensureZernioProfile,
  getOpenOrg,
  getTenantFor,
  NOT_ALLOWED,
  openBrand,
} from "@/features/tenants";
import { ASK_FIRST_IDS } from "@/lib/ask-first";
import { writeAudit } from "@/lib/audit";
import { markSetupPassed } from "@/lib/setup/passed";
import { getSocialProvider } from "@/lib/social";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { PENDING_BRAND_NAME } from "./brand-name";
import { batchProgress, type BatchProgress } from "./copy";
import { isSetupScreen, type SetupScreen } from "./flow";
import { loadSetupSending } from "./setup-data";

// Setup, Walter's flow (approved 20 Nov). Every action checks the role first (an action is
// reachable without its button), writes with the service role where owners have no grant, and
// audits what the owner did (rule 11).

/** Remembers the screen the owner is on, so reopening setup lands there (audited when it moves). */
async function saveScreen(tenantId: string, userId: string, screen: SetupScreen): Promise<void> {
  const db = getServiceClient();
  const { data: t } = await db.from("tenants").select("setup_screen").eq("id", tenantId).single();
  if (t?.setup_screen === screen) return;
  const { error } = await db.from("tenants").update({ setup_screen: screen }).eq("id", tenantId);
  if (error) return;
  await writeAudit(db, {
    tenantId,
    action: "setup_screen_saved",
    actor: userId,
    details: { screen, from: t?.setup_screen ?? null },
  });
}

/** Next and Back between setup screens: remember where, then open it. */
export async function goToSetupScreen(formData: FormData): Promise<void> {
  const screen = formData.get("screen");
  if (!isSetupScreen(screen)) redirect("/setup");
  const tenant = await getTenantFor("brand.settings");
  if (tenant) await saveScreen(tenant.id, tenant.userId, screen);
  redirect(`/setup?screen=${screen}`);
}

export type NameState = { error?: string; name?: string };

const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter your business’s name.")
  .max(BRAND_NAME_MAX, `Keep the name under ${BRAND_NAME_MAX} characters.`);

/** Decision 6: "What's your business called?" when the connected profile had no name. */
export async function saveBusinessName(_prev: NameState, formData: FormData): Promise<NameState> {
  const raw = String(formData.get("name") ?? "");
  const parsed = nameSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, name: raw };
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED, name: raw };
  const db = getServiceClient();
  const { error } = await db
    .from("tenants")
    .update({ name: parsed.data, name_pending: false })
    .eq("id", tenant.id);
  if (error) return { error: "Couldn’t save. Try again.", name: raw };
  await writeAudit(db, {
    tenantId: tenant.id,
    action: "brand_named",
    actor: tenant.userId,
    details: { from: "setup" },
  });
  revalidatePath("/", "layout");
  redirect("/setup");
}

/**
 * Step 1 on /welcome for an organization with no business yet: make it (named later, from the
 * connected profile or by the owner: decision 6), open it, then the usual connect.
 */
export async function connectFirstAccount(formData: FormData): Promise<void> {
  const [user, org] = await Promise.all([getCurrentUser(), getOpenOrg()]);
  if (!org || !can(org.role, "brands.add")) redirect("/welcome");
  const supabase = await createServerSupabase();
  const { data: brands } = await supabase
    .from("tenants")
    .select("id")
    .eq("organization_id", org.id)
    .limit(1);
  if (!brands?.length) {
    const db = getServiceClient();
    const { data, error } = await db.rpc("create_brand_in_org", {
      p_org: org.id,
      p_actor: user.id,
      p_name: PENDING_BRAND_NAME,
    });
    const tenantId = data?.[0]?.tenant_id;
    if (error || !tenantId) {
      Sentry.captureException(error ?? new Error("create_brand returned nothing"));
      redirect("/welcome?connect_error=unavailable");
    }
    await db.from("tenants").update({ name_pending: true }).eq("id", tenantId);
    await writeAudit(db, {
      tenantId,
      action: "brand_created_for_connect",
      actor: user.id,
      details: { organizationId: org.id },
    });
    try {
      await ensureZernioProfile({ db, social: getSocialProvider }, tenantId);
    } catch (e) {
      // connectAccount links the profile again.
      Sentry.captureException(e, { extra: { tenantId } });
    }
    await openBrand(tenantId);
  }
  formData.set("back", "/welcome");
  await connectAccount(formData);
}

export interface SendState {
  error?: string;
  sent?: number;
  skipped?: number;
}

const pairSchema = z
  .array(z.string().regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/i))
  .min(1)
  .max(200);

/**
 * "Send N replies" (decision 8): each goes through the normal approval (policy, idempotency key,
 * undo window, 25 s spacing per account) via the Inbox's Send all, 50 at a time. Returns at once;
 * the replies go out in the background and the next screen follows them.
 */
export async function sendSetupReplies(input: {
  pairs: string[];
  next: string | null;
}): Promise<SendState> {
  const parsed = pairSchema.safeParse(input.pairs);
  if (!parsed.success) return { error: "Something went wrong. Please reload." };
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  let sent = 0;
  let skipped = 0;
  for (let i = 0; i < parsed.data.length; i += 50) {
    const fd = new FormData();
    for (const pair of parsed.data.slice(i, i + 50)) fd.append("pair", pair);
    const r = await sendAllReadyAction({}, fd);
    if (r.error) return { error: r.error, sent, skipped };
    sent += r.sent ?? 0;
    skipped += r.skipped ?? 0;
  }
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "setup_replies_sent",
    actor: tenant.userId,
    details: { sent, skipped },
  });
  if (isSetupScreen(input.next) && can(tenant.role, "brand.settings")) {
    await saveScreen(tenant.id, tenant.userId, input.next);
  }
  revalidatePath("/setup");
  return { sent, skipped };
}

/** The progress card asks every few seconds: the setup replies on their way (real statuses). */
export async function setupSendingProgress(): Promise<BatchProgress | null> {
  const tenant = await getTenantFor("inbox.read");
  if (!tenant) return null;
  try {
    return batchProgress(await loadSetupSending(getServiceClient(), tenant.id));
  } catch {
    return null;
  }
}

export interface AnswerWaitingState {
  error?: string;
  /** Waggle's new reply, saved as a draft (sent from here or the Inbox). */
  reply?: { draftId: string; body: string };
  /** Still being written: it shows up in the Inbox in a minute. */
  queued?: boolean;
  /** Waggle still couldn't answer from what was typed. */
  stillNeedsYou?: boolean;
}

const answerSchema = z.object({
  itemId: z.uuid(),
  facts: z.string().trim().min(1, "Type the answer first.").max(2000, "Keep it shorter."),
});

/**
 * 3.3 "customers still waiting": the owner types the facts; they're saved as business info
 * (titled with the customer's question) and Waggle writes the reply now, as a draft.
 */
export async function answerWaitingMessage(input: {
  itemId: string;
  facts: string;
}): Promise<AnswerWaitingState> {
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const db = getServiceClient();
  const { data: item } = await db
    .from("inbound_items")
    .select("id, text, status")
    .eq("id", parsed.data.itemId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!item || item.status !== "escalated") return { error: "This message was already handled." };
  const saved = await addAnswerNow({
    question: item.text.replace(/\s+/g, " ").trim() || "Customer question",
    answer: parsed.data.facts,
  });
  if ("error" in saved) return { error: saved.error };
  const outcome = await redraftPulledItem(item.id);
  if (outcome.outcome === "queued") return { queued: true };
  if (outcome.outcome !== "drafted") {
    return {
      error:
        "Saved to your business info, but Waggle couldn’t write the reply. Try it in your Inbox.",
    };
  }
  const { data: draft } = await db
    .from("drafts")
    .select("id, body, needs_human")
    .eq("item_id", item.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!draft || draft.needs_human) return { stillNeedsYou: true };
  return { reply: { draftId: draft.id, body: draft.body } };
}

/** "Skip, I'll answer it myself" and "Skip all": the messages stay in the Inbox (audited). */
export async function skipWaitingMessages(input: { itemIds: string[] }): Promise<void> {
  const ids = z.array(z.uuid()).max(500).safeParse(input.itemIds);
  if (!ids.success || ids.data.length === 0) return;
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return;
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "setup_waiting_skipped",
    actor: tenant.userId,
    details: { count: ids.data.length },
  });
}

const finishSchema = z.object({
  topics: z.array(z.enum(ASK_FIRST_IDS)).max(ASK_FIRST_IDS.length),
  mode: z.enum(["approve", "auto"]),
});

/**
 * 3.4 "Go to my inbox": saves the Always ask me topics and how replies go out, marks setup done
 * (audited), then the Inbox with the welcome pop-up (build A, /inbox?welcome=1).
 */
export async function finishSetup(formData: FormData): Promise<void> {
  const parsed = finishSchema.safeParse({
    topics: formData.getAll("topic").map(String),
    mode: formData.get("mode") === "auto" ? "auto" : "approve",
  });
  if (!parsed.success) redirect("/setup?screen=how");
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) redirect("/inbox");
  const db = getServiceClient();
  const { topics } = parsed.data;
  // Free approves every reply (19 Nov): Reply on its own opens the Solo offer instead.
  const mode =
    parsed.data.mode === "auto" && (await planAllowsAutoReply(db, tenant.id)) ? "auto" : "approve";

  const { data: before } = await db
    .from("tenants")
    .select("ask_first_topics, setup_done_at")
    .eq("id", tenant.id)
    .single();
  await db
    .from("tenants")
    .update({
      ask_first_topics: topics,
      setup_screen: "how",
      ...(before?.setup_done_at ? {} : { setup_done_at: new Date().toISOString() }),
    })
    .eq("id", tenant.id);
  const was = [...(before?.ask_first_topics ?? [])].sort().join(",");
  if (was !== [...topics].sort().join(",")) {
    await writeAudit(db, {
      tenantId: tenant.id,
      action: "ask_first_topics_changed",
      actor: tenant.userId,
      details: { from: before?.ask_first_topics ?? [], to: topics },
    });
  }
  const fd = new FormData();
  fd.set("category", "faq");
  fd.set("mode", mode);
  await updateAutonomyMode({}, fd);
  await writeAudit(db, {
    tenantId: tenant.id,
    action: "setup_replies_chosen",
    actor: tenant.userId,
    details: { category: "faq", mode },
  });
  if (!before?.setup_done_at) {
    await writeAudit(db, {
      tenantId: tenant.id,
      action: "setup_finished",
      actor: tenant.userId,
      details: { topics: topics.length, mode },
    });
  }
  await markSetupPassed(db, { tenantId: tenant.id, how: "finished", userId: tenant.userId });
  revalidatePath("/", "layout");
  redirect("/inbox?welcome=1");
}
