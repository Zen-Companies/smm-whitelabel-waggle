import "server-only";
import * as Sentry from "@sentry/nextjs";
import { writeAudit } from "@/lib/audit";
import { unconfirmedUserIds } from "@/lib/email/confirmations";
import type { Mailer } from "@/lib/email/mailer";
import type { ServiceClient } from "@/lib/supabase/service";
import { weekRange } from "./copy";
import { weeklyEmail } from "./email";
import { businessZone } from "./schedule";
import { parseWeekSummary } from "./summary";

// The Monday email (board "Your week", approved 26 Nov), the jobs route step: after a Monday
// check-up is done, its numbers go to the business's Owners (not the rest of the team), unless
// they turned it off in Settings → Notifications. Check now never emails. A run's email is
// claimed before sending (email_status) and the mailer's idempotency key keeps a retry from
// sending twice.

const RUNS_PER_TICK = 10;
/** An email that kept failing for a day is dropped (the card on Today has the same numbers). */
const GIVE_UP_MS = 24 * 60 * 60 * 1000;

export interface WeeklyEmailDeps {
  db: ServiceClient;
  mailer: Mailer;
  appUrl: string;
  now?: Date;
  shouldContinue: () => boolean;
}

export async function sendWeeklyEmails(
  deps: WeeklyEmailDeps,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const result = { sent: 0, skipped: 0, failed: 0 };
  const { data: due, error } = await db
    .from("weekly_checks")
    .select("id, tenant_id, window_start, window_end, finished_at, summary")
    .eq("email_status", "pending")
    .eq("status", "done")
    .order("finished_at", { ascending: true })
    .limit(RUNS_PER_TICK);
  if (error) throw new Error(`weekly email: runs lookup failed: ${error.message}`);

  for (const run of due ?? []) {
    if (!deps.shouldContinue()) break;
    const settle = (email_status: "sent" | "skipped") =>
      db
        .from("weekly_checks")
        .update({
          email_status,
          ...(email_status === "sent" ? { email_sent_at: new Date().toISOString() } : {}),
        })
        .eq("id", run.id);
    const summary = parseWeekSummary(run.summary);
    const tooLate =
      run.finished_at !== null && now.getTime() - Date.parse(run.finished_at) > GIVE_UP_MS;
    if (!summary || tooLate) {
      await settle("skipped");
      result.skipped += 1;
      continue;
    }
    const { data: claimed } = await db
      .from("weekly_checks")
      .update({ email_status: "sending" })
      .eq("id", run.id)
      .eq("email_status", "pending")
      .select("id");
    if (!claimed?.length) continue;

    try {
      const { data: tenant } = await db
        .from("tenants")
        .select("name, organization_id, offboarded_at")
        .eq("id", run.tenant_id)
        .maybeSingle();
      if (!tenant?.organization_id || tenant.offboarded_at) {
        await settle("skipped");
        result.skipped += 1;
        continue;
      }
      const [{ data: team, error: teamErr }, { data: bill }] = await Promise.all([
        db.rpc("organization_team", { p_org: tenant.organization_id }),
        db
          .from("org_billing")
          .select("time_zone")
          .eq("organization_id", tenant.organization_id)
          .maybeSingle(),
      ]);
      if (teamErr) throw new Error(`weekly email: team lookup failed: ${teamErr.message}`);
      // The business's Owners who can see it (an Owner of the whole organization, or of this brand).
      const owners = (team ?? []).filter(
        (m) =>
          m.role === "owner" && m.email && (m.all_brands || m.tenant_ids.includes(run.tenant_id)),
      );
      const unconfirmed = await unconfirmedUserIds(
        db,
        owners.map((o) => o.user_id),
      );
      const confirmed = owners.filter((o) => !unconfirmed.has(o.user_id));
      const { data: optedOut } = confirmed.length
        ? await db
            .from("email_opt_outs")
            .select("user_id")
            .eq("kind", "weekly")
            .in(
              "user_id",
              confirmed.map((o) => o.user_id),
            )
        : { data: [] as { user_id: string }[] };
      const off = new Set((optedOut ?? []).map((o) => o.user_id));
      const to = confirmed.filter((o) => !off.has(o.user_id));
      if (to.length === 0) {
        await settle("skipped");
        result.skipped += 1;
        continue;
      }
      const zone = businessZone(bill?.time_zone ?? null);
      const email = weeklyEmail({
        businessName: tenant.name,
        range: weekRange(new Date(run.window_start), new Date(run.window_end), zone, "short"),
        summary,
        appUrl: deps.appUrl,
      });
      for (const owner of to) {
        await deps.mailer.send({
          to: [owner.email],
          ...email,
          idempotencyKey: `weekly:${run.id}:${owner.user_id}`,
        });
      }
      await settle("sent");
      await writeAudit(db, {
        tenantId: run.tenant_id,
        action: "weekly_email_sent",
        actor: "system",
        details: { runId: run.id, recipients: to.length },
      });
      result.sent += 1;
    } catch (err) {
      // Back to pending: a later minute retries (the idempotency key stops a second copy).
      await db
        .from("weekly_checks")
        .update({ email_status: "pending" })
        .eq("id", run.id)
        .eq("email_status", "sending");
      Sentry.captureException(err, { extra: { weeklyCheckId: run.id } });
      result.failed += 1;
    }
  }
  return result;
}
