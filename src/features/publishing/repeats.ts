import * as Sentry from "@sentry/nextjs";
import { writeAudit } from "@/lib/audit";
import { mediaKindOf } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";
import { parsePostOptions } from "./post-options";
import { createPost, type PostDeps } from "./posts";
import type { StoredMedia } from "./publish";
import { wallClockIn } from "./post-time";
import { planNext, ruleFromFirst, ruleOfRow, type RepeatChoice } from "./repeat-rule";

// Repeat posts (Posts Round 5, board section 2, approved 27 Nov). A repeat keeps its own copy of
// the post (text, files, accounts, choices: the same each time) and its rule. Zernio holds one
// planned post per repeat: once that one has gone out (its time passed, or it was published,
// failed or cancelled), the minute job makes the next one through createPost, the usual publish
// path. Called with a tenant already checked (Server Actions) or by the job.

/** The next post is planned at least this far ahead (missed times are skipped, never late). */
export const REPEAT_MIN_AHEAD_MS = 10 * 60_000;

/** After a repeat couldn't make its next post (an account disconnected…), it tries again in. */
export const REPEAT_RETRY_MS = 60 * 60_000;

/** Statuses after which a planned post has gone (or won't go) out. */
const DONE = new Set(["published", "partial", "failed", "cancelled"]);

const REPEAT_COLUMNS =
  "id, tenant_id, every, weekday, month_day, at_time, time_zone, ends, end_date, max_count, made_count, content, media, target_account_ids, platform_options, tiktok_consent, last_post_id, last_slot, last_error, stopped_at, finished_at";

/** The post's own copy for a repeat: what every next one posts. */
async function snapshotOf(db: ServiceClient, tenantId: string, postId: string) {
  const { data } = await db
    .from("posts")
    .select(
      "id, content, media, target_account_ids, platform_options, tiktok_consent_at, scheduled_for",
    )
    .eq("id", postId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

/**
 * Starts a repeat from a post just planned (its time is the first one). Returns the repeat's id,
 * or null when the post isn't there (or has no time).
 */
export async function createRepeat(
  db: ServiceClient,
  input: {
    tenantId: string;
    userId: string;
    postId: string;
    choice: RepeatChoice;
    timeZone: string;
  },
): Promise<string | null> {
  const post = await snapshotOf(db, input.tenantId, input.postId);
  if (!post?.scheduled_for) return null;
  const first = new Date(post.scheduled_for);
  const rule = ruleFromFirst(input.choice, first, input.timeZone);
  const { data, error } = await db
    .from("post_repeats")
    .insert({
      tenant_id: input.tenantId,
      every: rule.every,
      weekday: rule.weekday,
      month_day: rule.monthDay,
      at_time: rule.time,
      time_zone: rule.timeZone,
      ends: rule.ends,
      end_date: rule.endDate,
      max_count: rule.maxCount,
      made_count: 1,
      content: post.content,
      media: post.media,
      target_account_ids: post.target_account_ids,
      platform_options: post.platform_options,
      tiktok_consent: !!post.tiktok_consent_at,
      last_post_id: post.id,
      last_slot: first.toISOString(),
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(`post_repeats insert failed: ${error.message}`);
  await db.from("posts").update({ repeat_id: data.id }).eq("id", post.id);
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "post_repeat_created",
    actor: input.userId,
    details: {
      repeatId: data.id,
      postId: post.id,
      every: rule.every,
      ends: rule.ends,
      ...(rule.maxCount ? { count: rule.maxCount } : {}),
      ...(rule.endDate ? { endDate: rule.endDate } : {}),
    },
  });
  return data.id;
}

export type StopRepeatResult = { ok: true } | { ok: false; error: "not_found" };

/** Stop repeating: no more posts after the one already planned (that one still goes out). */
export async function stopRepeat(
  db: ServiceClient,
  input: { tenantId: string; userId: string; repeatId: string; now?: Date },
): Promise<StopRepeatResult> {
  const { data } = await db
    .from("post_repeats")
    .update({
      stopped_at: (input.now ?? new Date()).toISOString(),
      stopped_by: input.userId,
      updated_at: (input.now ?? new Date()).toISOString(),
    })
    .eq("id", input.repeatId)
    .eq("tenant_id", input.tenantId)
    .is("stopped_at", null)
    .select("id");
  if (!data?.length) return { ok: false, error: "not_found" };
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "post_repeat_stopped",
    actor: input.userId,
    details: { repeatId: input.repeatId },
  });
  return { ok: true };
}

/**
 * "This and the ones after" (an edit of a repeating post): the repeat takes the edited post's
 * text, files, accounts and choices, and its new time becomes the rule's (weekday, day, time).
 * "Just this one" changes nothing here.
 */
export async function applyEditToRepeat(
  db: ServiceClient,
  input: { tenantId: string; userId: string; postId: string },
): Promise<boolean> {
  const post = await snapshotOf(db, input.tenantId, input.postId);
  const { data: row } = await db
    .from("posts")
    .select("repeat_id")
    .eq("id", input.postId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (!post?.scheduled_for || !row?.repeat_id) return false;
  const { data: repeat } = await db
    .from("post_repeats")
    .select(REPEAT_COLUMNS)
    .eq("id", row.repeat_id)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (!repeat || repeat.stopped_at || repeat.finished_at) return false;
  const at = new Date(post.scheduled_for);
  const { day, time } = wallClockIn(at, repeat.time_zone);
  const [y, m, d] = day.split("-").map(Number);
  const isLast = repeat.last_post_id === post.id;
  await db
    .from("post_repeats")
    .update({
      content: post.content,
      media: post.media,
      target_account_ids: post.target_account_ids,
      platform_options: post.platform_options,
      tiktok_consent: !!post.tiktok_consent_at,
      at_time: time,
      weekday: repeat.every === "week" ? new Date(Date.UTC(y, m - 1, d)).getUTCDay() : null,
      month_day: repeat.every === "month" ? d : null,
      // The next one follows the new time.
      ...(isLast ? { last_slot: at.toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", repeat.id);
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "post_repeat_updated",
    actor: input.userId,
    details: { repeatId: repeat.id, postId: post.id },
  });
  return true;
}

export interface RepeatJobSummary {
  made: number;
  finished: number;
  failed: number;
}

/**
 * Job route, every minute: for each live repeat whose planned post has gone out, makes the next
 * one (or marks the repeat finished at its end). A post that couldn't be made (an account
 * disconnected, a platform refused) is tried again an hour later; its reason is kept as a code.
 */
export async function scheduleRepeats(
  deps: PostDeps & { shouldContinue?: () => boolean; now?: () => Date },
  opts: { tenantId?: string; limit?: number } = {},
): Promise<RepeatJobSummary> {
  const { db } = deps;
  const clock = deps.now ?? (() => new Date());
  const now = clock();
  let query = db
    .from("post_repeats")
    .select(REPEAT_COLUMNS)
    .is("stopped_at", null)
    .is("finished_at", null)
    .or(`next_try_at.is.null,next_try_at.lte.${now.toISOString()}`)
    .order("created_at")
    .limit(opts.limit ?? 50);
  if (opts.tenantId) query = query.eq("tenant_id", opts.tenantId);
  const { data: repeats, error } = await query;
  if (error) throw new Error(`post_repeats lookup failed: ${error.message}`);
  const summary: RepeatJobSummary = { made: 0, finished: 0, failed: 0 };
  if (!repeats?.length) return summary;

  const lastIds = repeats.flatMap((r) => r.last_post_id ?? []);
  const { data: lastPosts } = lastIds.length
    ? await db.from("posts").select("id, status, scheduled_for").in("id", lastIds)
    : { data: [] };
  const last = new Map((lastPosts ?? []).map((p) => [p.id, p]));

  for (const r of repeats) {
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    const post = r.last_post_id ? last.get(r.last_post_id) : undefined;
    const gone =
      !post ||
      DONE.has(post.status) ||
      (!!post.scheduled_for && new Date(post.scheduled_for).getTime() <= now.getTime());
    if (!gone) continue;

    const rule = ruleOfRow(r);
    const step = planNext(rule, {
      lastSlot: new Date(r.last_slot),
      madeCount: r.made_count,
      now,
      minAheadMs: REPEAT_MIN_AHEAD_MS,
    });
    if (step.kind === "finished") {
      await db
        .from("post_repeats")
        .update({ finished_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("id", r.id);
      await writeAudit(db, {
        tenantId: r.tenant_id,
        action: "post_repeat_finished",
        actor: "system",
        details: { repeatId: r.id, made: r.made_count },
      });
      summary.finished += 1;
      continue;
    }

    try {
      const media = ((r.media as StoredMedia[] | null) ?? []).flatMap((m) =>
        m.url
          ? [
              {
                url: m.url,
                seconds: m.seconds ?? null,
                type: mediaKindOf({
                  url: m.url,
                  type: m.type === "video" ? "video" : m.type === "image" ? "image" : null,
                }),
                altText: m.altText ?? null,
                width: m.width ?? null,
                height: m.height ?? null,
              },
            ]
          : [],
      );
      const result = await createPost(
        { db, social: deps.social },
        {
          tenantId: r.tenant_id,
          userId: "system",
          content: r.content,
          accountIds: r.target_account_ids,
          scheduledFor: step.slot,
          media,
          options: parsePostOptions(r.platform_options),
          tiktokConsent: r.tiktok_consent,
          via: { repeat: r.id },
          now,
        },
      );
      if (!result.ok) {
        const reason = result.error;
        await db
          .from("post_repeats")
          .update({
            next_try_at: new Date(now.getTime() + REPEAT_RETRY_MS).toISOString(),
            last_error: reason,
            updated_at: now.toISOString(),
          })
          .eq("id", r.id);
        if (r.last_error !== reason) {
          await writeAudit(db, {
            tenantId: r.tenant_id,
            action: "post_repeat_held",
            actor: "system",
            details: { repeatId: r.id, reason },
          });
        }
        summary.failed += 1;
        continue;
      }
      await db.from("posts").update({ repeat_id: r.id }).eq("id", result.postId);
      await db
        .from("post_repeats")
        .update({
          last_post_id: result.postId,
          last_slot: step.slot.toISOString(),
          made_count: r.made_count + 1,
          next_try_at: null,
          last_error: null,
          updated_at: now.toISOString(),
        })
        .eq("id", r.id);
      summary.made += 1;
    } catch (error) {
      Sentry.captureException(error, { extra: { repeatId: r.id } });
      await db
        .from("post_repeats")
        .update({
          next_try_at: new Date(now.getTime() + REPEAT_RETRY_MS).toISOString(),
          last_error: "unexpected",
          updated_at: now.toISOString(),
        })
        .eq("id", r.id);
      summary.failed += 1;
    }
  }
  return summary;
}
