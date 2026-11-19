import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { Mailer } from "@/lib/email/mailer";
import type { ServiceClient } from "@/lib/supabase/service";
import { decideMorning, expiryLine, morningEmail, morningWindow } from "./morning-after";

// First connect, "Next morning" (20 Nov), the jobs route step. Bounded (a few organizations per
// run) and idempotent: an organization's row in first_morning_emails is claimed before sending
// and settles it for good (sent or skipped), so the email never repeats. Ids and counts only in
// logs and rows (rule 10).

/** Catch-ups started this long ago or less can still be due a morning email. */
const LOOKBACK_MS = 48 * 60 * 60 * 1000;
/** Organizations looked at per run. */
const ORGS_PER_RUN = 10;
/** Messages read to count customers (a first night rarely gets near it). */
const MESSAGES_CAP = 1000;
/** Meta's DM window: what "expires" means in the email (approvals' DM_REPLY_WINDOW_MS). */
const DM_WINDOW_PLATFORMS = ["instagram", "facebook"];
const DM_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface MorningAfterDeps {
  db: ServiceClient;
  mailer: Mailer;
  appUrl: string;
  now?: Date;
  shouldContinue: () => boolean;
}

export interface MorningAfterSummary {
  sent: number;
  skipped: number;
  failed: number;
}

interface CatchUpRow {
  id: string;
  created_at: string;
  social_account_id: string;
  tenant_id: string;
}

const settle = (
  db: ServiceClient,
  row: {
    organization_id: string;
    catch_up_id: string;
    outcome: "skipped";
    reason: string;
    messages?: number;
    replies?: number;
  },
) =>
  db
    .from("first_morning_emails")
    .upsert(row, { onConflict: "organization_id", ignoreDuplicates: true })
    .then(({ error }) => {
      if (error) throw new Error(`morning email: settling failed: ${error.message}`);
    });

/** "@harbourbean", or a Page's name as it is. */
function handleOf(username: string | null): string | null {
  const name = (username ?? "").trim().replace(/^@/, "");
  if (!name) return null;
  return /\s/.test(name) ? name : `@${name}`;
}

async function orgCounts(db: ServiceClient, tenantIds: string[], since: string, now: Date) {
  const [{ data: messages, error: e1 }, { count: replies, error: e2 }, { data: dms, error: e3 }] =
    await Promise.all([
      // New customer messages since the connect (spam and ignored left out).
      db
        .from("inbound_items")
        .select("author_name, social_account_id")
        .in("tenant_id", tenantIds)
        .in("kind", ["comment", "dm"])
        .gt("received_at", since)
        .neq("status", "ignored")
        .or("category.is.null,category.neq.spam")
        .limit(MESSAGES_CAP),
      // Replies drafted and waiting for the owner.
      db
        .from("inbound_items")
        .select("id", { count: "exact", head: true })
        .in("tenant_id", tenantIds)
        .eq("status", "awaiting_approval"),
      // Waiting DMs whose reply window is still open: they expire.
      db
        .from("inbound_items")
        .select("conversations!inner (last_customer_message_at, platform)")
        .in("tenant_id", tenantIds)
        .eq("status", "awaiting_approval")
        .eq("kind", "dm")
        .in("conversations.platform", DM_WINDOW_PLATFORMS)
        .gt(
          "conversations.last_customer_message_at",
          new Date(now.getTime() - DM_REPLY_WINDOW_MS).toISOString(),
        ),
    ]);
  const error = e1 ?? e2 ?? e3;
  if (error) throw new Error(`morning email: counting failed: ${error.message}`);
  const closes = (dms ?? []).flatMap((d) =>
    d.conversations.last_customer_message_at
      ? [Date.parse(d.conversations.last_customer_message_at) + DM_REPLY_WINDOW_MS]
      : [],
  );
  const rows = messages ?? [];
  const customers = new Set(rows.map((r, i) => r.author_name ?? `unknown:${i}`)).size;
  return {
    messages: rows.length,
    customers,
    accounts: new Set(rows.map((r) => r.social_account_id)),
    replies: replies ?? 0,
    expiring: closes.length ? { count: closes.length, first: new Date(Math.min(...closes)) } : null,
  };
}

async function handleOrg(
  deps: MorningAfterDeps,
  orgId: string,
  catchUp: CatchUpRow,
  now: Date,
): Promise<"sent" | "skipped" | "waiting"> {
  const { db } = deps;
  const { data: brands } = await db
    .from("tenants")
    .select("id")
    .eq("organization_id", orgId)
    .is("offboarded_at", null);
  const tenantIds = (brands ?? []).map((b) => b.id);
  // Only the organization's first catch-up: a later account's connect isn't "the first".
  const { data: earliest } = tenantIds.length
    ? await db
        .from("catch_ups")
        .select("id")
        .in("tenant_id", tenantIds)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };
  if (!earliest || earliest.id !== catchUp.id) {
    await settle(db, {
      organization_id: orgId,
      catch_up_id: catchUp.id,
      outcome: "skipped",
      reason: "not_first",
    });
    return "skipped";
  }

  // No stored time zone yet: the UTC fallback (morning-after.ts).
  const window = morningWindow(new Date(catchUp.created_at), null);
  if (now < window.from) return "waiting";
  const counts = await orgCounts(db, tenantIds, catchUp.created_at, now);
  const decision = decideMorning({
    now,
    window,
    messages: counts.messages,
    replies: counts.replies,
  });
  if (decision === "wait") return "waiting";
  if (decision !== "send") {
    await settle(db, {
      organization_id: orgId,
      catch_up_id: catchUp.id,
      outcome: "skipped",
      reason: decision === "skip_passed" ? "morning_passed" : "nothing_new",
      messages: counts.messages,
      replies: counts.replies,
    });
    return "skipped";
  }

  const [{ data: org }, { data: team, error: teamErr }, { data: account }] = await Promise.all([
    db.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    db.rpc("organization_team", { p_org: orgId }),
    db.from("social_accounts").select("username").eq("id", catchUp.social_account_id).maybeSingle(),
  ]);
  if (teamErr) throw new Error(`morning email: reading the team failed: ${teamErr.message}`);
  const owners = (team ?? []).filter((m) => m.role === "owner" && m.email);
  const { data: optedOut } = owners.length
    ? await db
        .from("email_opt_outs")
        .select("user_id")
        .eq("kind", "check_in")
        .in(
          "user_id",
          owners.map((o) => o.user_id),
        )
    : { data: [] as { user_id: string }[] };
  const off = new Set((optedOut ?? []).map((o) => o.user_id));
  const to = owners.filter((o) => !off.has(o.user_id));
  if (!to.length) {
    await settle(db, {
      organization_id: orgId,
      catch_up_id: catchUp.id,
      outcome: "skipped",
      reason: owners.length ? "opted_out" : "no_owner",
      messages: counts.messages,
      replies: counts.replies,
    });
    return "skipped";
  }

  // Claim: one run sends it. A row already there (another run, or settled) means nothing to do.
  const { data: claimed, error: claimErr } = await db
    .from("first_morning_emails")
    .upsert(
      {
        organization_id: orgId,
        catch_up_id: catchUp.id,
        outcome: "sending",
        messages: counts.messages,
        replies: counts.replies,
      },
      { onConflict: "organization_id", ignoreDuplicates: true },
    )
    .select("organization_id");
  if (claimErr) throw new Error(`morning email: claiming failed: ${claimErr.message}`);
  if (!claimed?.length) return "skipped";

  const handle =
    counts.accounts.size > 1
      ? "your accounts"
      : (handleOf(account?.username ?? null) ?? "your account");
  try {
    for (const owner of to) {
      const email = morningEmail({
        firstName: owner.full_name?.trim().split(/\s+/)[0] || null,
        handle,
        orgName: org?.name ?? "your business",
        messages: counts.messages,
        customers: counts.customers,
        replies: counts.replies,
        expiry: expiryLine(counts.expiring, now, null),
        appUrl: deps.appUrl,
      });
      await deps.mailer.send({
        to: [owner.email],
        ...email,
        // A retry after a lost response doesn't send twice.
        idempotencyKey: `first-morning:${orgId}:${owner.user_id}`,
      });
    }
  } catch (error) {
    // Nothing (or not everything) went out: free the claim so a later run in the window retries;
    // the mailer's idempotency key keeps anyone who already got it from getting it twice.
    await db
      .from("first_morning_emails")
      .delete()
      .eq("organization_id", orgId)
      .eq("outcome", "sending");
    throw error;
  }
  await db
    .from("first_morning_emails")
    .update({ outcome: "sent", sent_at: new Date().toISOString() })
    .eq("organization_id", orgId);
  await db.from("organization_audit").insert({
    organization_id: orgId,
    action: "first_morning_email.sent",
    actor: "system",
    details: { messages: counts.messages, replies: counts.replies, recipients: to.length },
  });
  return "sent";
}

/**
 * The morning-after emails that are due: organizations whose first catch-up started in the last
 * two days and haven't been settled yet. Each is sent inside its morning window or settled.
 */
export async function sendMorningAfterEmails(deps: MorningAfterDeps): Promise<MorningAfterSummary> {
  const summary: MorningAfterSummary = { sent: 0, skipped: 0, failed: 0 };
  const { db } = deps;
  const now = deps.now ?? new Date();
  const { data, error } = await db
    .from("catch_ups")
    .select("id, created_at, social_account_id, tenant_id")
    .gte("created_at", new Date(now.getTime() - LOOKBACK_MS).toISOString())
    .lte("created_at", new Date(now.getTime() - 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`morning email: reading catch-ups failed: ${error.message}`);
  const rows: CatchUpRow[] = data ?? [];
  if (rows.length === 0) return summary;
  const { data: tenants, error: tErr } = await db
    .from("tenants")
    .select("id, organization_id")
    .in("id", [...new Set(rows.map((r) => r.tenant_id))]);
  if (tErr) throw new Error(`morning email: reading brands failed: ${tErr.message}`);
  const orgOf = new Map((tenants ?? []).map((t) => [t.id, t.organization_id]));
  // Each organization's earliest recent catch-up.
  const byOrg = new Map<string, CatchUpRow>();
  for (const row of rows) {
    const org = orgOf.get(row.tenant_id);
    if (org && !byOrg.has(org)) byOrg.set(org, row);
  }
  if (byOrg.size === 0) return summary;
  const { data: done, error: doneErr } = await db
    .from("first_morning_emails")
    .select("organization_id")
    .in("organization_id", [...byOrg.keys()]);
  if (doneErr) throw new Error(`morning email: reading sent ones failed: ${doneErr.message}`);
  for (const d of done ?? []) byOrg.delete(d.organization_id);

  let looked = 0;
  for (const [orgId, catchUp] of byOrg) {
    // The morning hasn't come for this one yet: no queries needed.
    if (now < morningWindow(new Date(catchUp.created_at), null).from) continue;
    if (looked >= ORGS_PER_RUN || !deps.shouldContinue()) break;
    looked += 1;
    try {
      const outcome = await handleOrg(deps, orgId, catchUp, now);
      if (outcome === "sent") summary.sent += 1;
      else if (outcome === "skipped") summary.skipped += 1;
    } catch (e) {
      summary.failed += 1;
      Sentry.captureException(e, { extra: { orgId } });
    }
  }
  return summary;
}
