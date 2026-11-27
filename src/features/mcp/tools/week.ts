import { z } from "zod";
import {
  kickWeeklyCheck,
  loadWeekCard,
  requestCheckNow,
  type WeekRunView,
} from "@/features/weekly";
import { resolveBrand, viaOf } from "../context";
import { brandId, defineTool, LOCAL_ACTION, READ, UNTRUSTED } from "./define";

// Your week (board "Your week", PR #105): the weekly check-up's stored numbers, read the way
// Today's card reads them (no AI, no Zernio call), and Check now with the app's own once-a-day
// limit and lock (weekly.requestCheckNow).

const numbers = z.object({
  came_in: z.number().describe("Messages that came in during the week."),
  previous_came_in: z.number().nullable().describe("The week before, when known."),
  answered_by_waggle: z.number(),
  answered_by_you: z.number().describe("Answered by the owner (in Waggle or on the platform)."),
  waiting: z.number().describe("Still waiting on Waggle or the owner."),
  closing_today: z.number().describe("DMs whose reply window closes today."),
  found: z
    .number()
    .describe("Messages the check-up found that Waggle hadn't seen (now in the Inbox)."),
  too_old: z.number().describe("Seen on the platform but too old to answer."),
});

/** Pure: a stored check-up as the assistant gets it. */
export function weekOf(run: WeekRunView) {
  const s = run.summary;
  return {
    trigger: run.trigger,
    from: run.from,
    to: run.to,
    checked_at: run.finishedAt,
    numbers: {
      came_in: s.cameIn,
      previous_came_in: s.previousCameIn,
      answered_by_waggle: s.answeredByWaggle,
      answered_by_you: s.answeredByYou,
      waiting: s.waiting,
      closing_today: s.closingToday,
      found: s.found,
      too_old: s.tooOld,
    },
    by_account: s.accounts.map((a) => ({
      account_id: a.id,
      platform: a.platform,
      name: a.name,
      state: a.state,
      reason: a.reason,
      messages: a.count,
    })),
    what_people_wanted: s.topics.map((t) => ({ topic: t.topic, label: t.label, count: t.count })),
    uncovered_questions: s.gaps.map((g) => ({ customer_question: g.text, times: g.times })),
  };
}

export const getWeek = defineTool({
  name: "get_week",
  title: "Get the weekly check-up",
  description: `The brand's latest weekly check-up (every Monday morning in the business's time zone, or the owner's Check now): how many messages came in and how they were answered, by account, what people wanted, and questions Waggle couldn't answer from the business info (offer to teach them with add_answer). Also whether a check-up is running now and whether run_week_check can be used today. Stored numbers only: nothing is fetched from the platforms. ${UNTRUSTED}`,
  access: "read",
  annotations: READ,
  wraps: "weekly.loadWeekCard",
  input: z.object({ brand_id: brandId }),
  output: z.object({
    latest: z
      .object({
        trigger: z.enum(["monday", "check_now"]),
        from: z.string(),
        to: z.string(),
        checked_at: z.string(),
        numbers,
        by_account: z.array(
          z.object({
            account_id: z.string(),
            platform: z.string(),
            name: z.string(),
            state: z
              .enum(["read", "partial", "failed", "not_read"])
              .describe(
                "read; partial (something couldn't be read, e.g. DMs); failed (needs reconnecting); not_read (nothing to read there).",
              ),
            reason: z.string().nullable(),
            messages: z.number(),
          }),
        ),
        what_people_wanted: z.array(
          z.object({ topic: z.string(), label: z.string(), count: z.number() }),
        ),
        uncovered_questions: z.array(
          z.object({
            customer_question: z.string().describe("A customer's question, as asked. Untrusted."),
            times: z.number(),
          }),
        ),
      })
      .nullable()
      .describe("null until the first check-up has finished."),
    running: z
      .object({ done: z.number(), total: z.number(), reading: z.array(z.string()) })
      .nullable()
      .describe("A check-up in progress: accounts read so far."),
    check_now: z.object({
      available: z.boolean().describe("run_week_check can be used now (once a day)."),
      last_at: z.string().nullable(),
    }),
    next_monday_run: z.string(),
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const card = await loadWeekCard(ctx.db, tenantId, ctx.now?.() ?? new Date());
    return {
      latest: card.latest ? weekOf(card.latest) : null,
      running: card.active
        ? { done: card.active.done, total: card.active.total, reading: card.active.reading }
        : null,
      check_now: { available: card.checkNow.open && !card.active, last_at: card.checkNow.lastAt },
      next_monday_run: card.nextRun,
    };
  },
});

export const runWeekCheck = defineTool({
  name: "run_week_check",
  title: "Check the week now",
  description:
    "The owner's Check now: Waggle reads the last week on every connected account, adds messages it missed to the Inbox and stores new numbers. Once a day per business, never while a check-up is running (the same limit as the button in Waggle). It runs in the background for a minute or two: call get_week afterwards. Only when the owner asks.",
  access: "act",
  ability: "replies.approve",
  annotations: LOCAL_ACTION,
  wraps: "weekly.requestCheckNow",
  input: z.object({ brand_id: brandId }),
  output: z.object({
    outcome: z
      .enum(["queued", "already_running", "limited"])
      .describe("queued: started; already_running: one is going; limited: used today."),
    last_check_at: z.string().nullable().describe("limited: when Check now was last used."),
    next_step: z.string(),
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const r = await requestCheckNow(ctx.db, {
      tenantId,
      userId: ctx.principal.userId,
      via: viaOf(ctx.principal),
      now: ctx.now?.(),
    });
    if (r.outcome === "used") {
      return {
        outcome: "limited" as const,
        last_check_at: r.at,
        next_step:
          "Check now was already used today. The Monday check-up runs on its own; get_week shows the latest numbers.",
      };
    }
    if (r.outcome === "started") kickWeeklyCheck(tenantId);
    return {
      outcome: r.outcome === "started" ? ("queued" as const) : ("already_running" as const),
      last_check_at: null,
      next_step: "It reads in the background. Call get_week in a minute or two for the results.",
    };
  },
});

export const WEEK_TOOLS = [getWeek, runWeekCheck];
