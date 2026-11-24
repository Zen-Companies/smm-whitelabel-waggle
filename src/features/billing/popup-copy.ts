import { platformLabel } from "@/lib/social/platforms";
import { FOUNDING, TRIAL, type PaidPlanId, type Plan, type PlanId } from "./plans";
import type { ReplyPain } from "./reply-pain";
import type { OfferReason } from "./upgrade";

// The upgrade pop-up (Walter's pop-ups plan, board "Replica update … upgrade pop-ups", approved 23
// Nov): one layout, six versions. A accounts, B Worker Bee, C replies, D reconnect, E Team, F try
// Solo / welcome. Every version has the same parts: a strip of three boxes, a headline naming the
// tap, one comparison line, a honey box with the brand's own numbers (dropped when there are
// none, never invented), three ticks, the pay buttons, the "$0 today" note and the quiet way out.
// Every plan number comes from the plans as staff set them (Staff → Plans). Pure.

export type PopupVersion =
  /** A: an account, named when the tap knows which. */
  | { v: "accounts"; platform: string | null }
  /** A, setup step 1: picking a second platform on Free. */
  | { v: "accounts_pick"; picked: string[] }
  /** B: Worker Bee, for every message or one kind of message. */
  | { v: "worker_bee"; topic: WorkerBeeTopic | null }
  /** C: out of replies, or running low. */
  | { v: "replies"; level: "out" | "low" }
  /** D: reconnect after 30 days away. */
  | { v: "idle"; platform: string | null }
  /** E: a Team feature. */
  | { v: "team"; sub: "invite" | "brands" | "follow_ups" | "leads" }
  /** F: the Try Solo banner, or the welcome after setup. */
  | { v: "try"; sub: "banner" | "welcome" };

/** The kinds of message Reply rules sets one by one (approvals' configurable categories). */
export const WORKER_BEE_TOPICS = ["faq", "lead"] as const;
export type WorkerBeeTopic = (typeof WORKER_BEE_TOPICS)[number];
const TOPIC_WORDS: Record<WorkerBeeTopic, { label: string; phrase: string }> = {
  faq: { label: "Questions", phrase: "questions" },
  lead: { label: "Leads", phrase: "people who want to buy" },
};

/** What the page's address adds to `?upgrade=`: the platform tapped, those picked, a topic. */
export interface PopupParams {
  platform?: string | null;
  /** Setup step 1: "instagram,tiktok". */
  platforms?: string | null;
  topic?: string | null;
}

const PLATFORM_ID = /^[a-z]{2,20}$/;
const cleanPlatform = (p: string | null | undefined) => (p && PLATFORM_ID.test(p) ? p : null);

/** Pure: which version a reason opens on Free, with what the address says. */
export function popupVersion(
  reason: OfferReason | "welcome",
  params: PopupParams = {},
  replies: "out" | "low" = "out",
): PopupVersion {
  switch (reason) {
    case "accounts":
    case "extra_account": {
      const picked = (params.platforms ?? "")
        .split(",")
        .map((p) => cleanPlatform(p.trim()))
        .filter((p): p is string => !!p)
        .slice(0, 3);
      if (picked.length >= 2) return { v: "accounts_pick", picked };
      return { v: "accounts", platform: cleanPlatform(params.platform) };
    }
    case "auto_reply": {
      const topic = (WORKER_BEE_TOPICS as readonly string[]).includes(params.topic ?? "")
        ? (params.topic as WorkerBeeTopic)
        : null;
      return { v: "worker_bee", topic };
    }
    case "out":
      return { v: "replies", level: "out" };
    case "replies":
    case "top_up":
      return { v: "replies", level: replies };
    case "idle":
      return { v: "idle", platform: cleanPlatform(params.platform) };
    case "team":
      return { v: "team", sub: "invite" };
    case "brands":
      return { v: "team", sub: "brands" };
    case "follow_ups":
      return { v: "team", sub: "follow_ups" };
    case "leads":
      return { v: "team", sub: "leads" };
    case "nudge":
      return { v: "try", sub: "banner" };
    case "welcome":
      return { v: "try", sub: "welcome" };
  }
}

/** The brand's own numbers, loaded when the pop-up opens (popup-facts.ts). Any may be missing. */
export interface PopupFacts {
  /** Connected platforms' ids, oldest first. */
  connected: string[];
  brandName: string | null;
  /** From the brand's latest catch-up (the 30-day read). */
  scan: {
    platform: string;
    /** "Wanted to buy": Jev leads plus price or order questions, nobody answered. */
    buyers: number;
    /** DMs past Meta's 24-hour window (one per conversation, spam left out). */
    lockedDms: number;
    /** Catch-up messages answered (sent), by kind. */
    answeredDms: number;
    answeredComments: number;
  } | null;
  pain: ReplyPain | null;
  /** This month's AI replies. */
  usage: { used: number; allowance: number; resetsOn: string } | null;
}

export const NO_FACTS: PopupFacts = {
  connected: [],
  brandName: null,
  scan: null,
  pain: null,
  usage: null,
};

/** A run of text, bold or not: the honey box's "**13 people** wanted to buy…". */
export interface Seg {
  text: string;
  bold?: boolean;
}

export interface StripBox {
  title: string;
  text: string;
  /** done: green (connected); now: honey (what the tap adds); open: dashed (room left). */
  tone: "done" | "now" | "open";
}

export interface Tick {
  bee: boolean;
  bold: string;
  rest: string | null;
}

export interface PopupContent {
  plan: PaidPlanId;
  strip: StripBox[];
  headline: string;
  sub: string;
  honey: Seg[] | null;
  ticks: Tick[];
  /** "Add a card, pay $0 today. Then $49 a month from November 30. …" */
  note: string;
  /** The card button: "Start free with a card", or without a trial "Pay with a card". */
  cardLabel: string;
  keep: { label: string; kind: "close" | "inbox" };
  /** × in the corner, Esc and the backdrop close it (not when out of replies). */
  closable: boolean;
  /** After Stripe's return: "You're on Solo. Free until November 30." */
  success: string;
  /** The success moment (24 Nov): "Solo" and "$49 a month" (founding price when it applies). */
  planName: string;
  price: string;
}

export interface PopupInput {
  version: PopupVersion;
  plans: Record<PlanId, Plan>;
  /** The organization's first paid plan starts with the trial. */
  trial: boolean;
  /** How long: 7 days, or 30 with the Black Friday or referral month (23 Nov). */
  trialDays?: number;
  /** The founding offer applies (first paid plan, spots left: BillingHost, as Your plan and checkout do). */
  founding?: boolean;
  facts: PopupFacts;
  now: Date;
}

const n = (v: number) => v.toLocaleString("en-US");
const plural = (k: number, one: string, many: string) => `${n(k)} ${k === 1 ? one : many}`;
const label = (id: string) => platformLabel(id);

/** "November 30": the trial's end, the first charge. */
export function trialEndLabel(now: Date, days: number = TRIAL.days): string {
  return new Date(now.getTime() + days * 86_400_000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Pure: the plan a version offers (Team features go straight to Team). */
export const offeredBy = (v: PopupVersion): PaidPlanId => (v.v === "team" ? "business" : "solo");

/** Pure: the "$0 today" note and the success line. With the founding offer (the pricing bible:
 * first 50 businesses, Team at $79 locked for 6 months) the founding plan's note uses that price. */
export function payWords(
  plan: Plan,
  free: Plan,
  trial: boolean,
  now: Date,
  founding = false,
  trialDays: number = TRIAL.days,
): { note: string; cardLabel: string; success: string; price: string } {
  const end = trialEndLabel(now, trialDays);
  const offer = founding && plan.id === FOUNDING.plan;
  const price = offer
    ? `$${n(FOUNDING.monthlyUsd)} a month (founding price, locked for ${n(FOUNDING.months)} months)`
    : `$${n(plan.monthlyUsd)} a month`;
  const perMonth = `$${n(offer ? FOUNDING.monthlyUsd : plan.monthlyUsd)} a month`;
  return trial
    ? {
        price: perMonth,
        note: `Add a card, pay $0 today. Then ${price} from ${end}. Cancel before then and you pay nothing.`,
        cardLabel: "Start free with a card",
        success: `You’re on ${plan.name}. Free until ${end}.`,
      }
    : {
        price: perMonth,
        note: offer
          ? `Pay $${n(FOUNDING.monthlyUsd)} today, then every month (founding price, locked for ${n(FOUNDING.months)} months). Cancel any time and you go back to ${free.name}.`
          : `Pay $${n(plan.monthlyUsd)} today, then every month. Cancel any time and you go back to ${free.name}.`,
        cardLabel: "Pay with a card",
        success: `You’re on ${plan.name}.`,
      };
}

function soloTicks(solo: Plan, free: Plan, used: number | null): Tick[] {
  return [
    {
      bee: false,
      bold: plural(solo.accounts, "account", "accounts"),
      rest:
        used !== null && used > 0
          ? `you use ${n(used)} now`
          : `${free.name} has ${n(free.accounts)}`,
    },
    ...(solo.features.autoReply
      ? [
          {
            bee: true,
            bold: "Worker Bee",
            rest: "answers every message for you, day or night, within Meta’s 24-hour window",
          },
        ]
      : []),
    {
      bee: false,
      bold: `${n(solo.replies)} replies a month`,
      rest: `${free.name} has ${n(free.replies)}`,
    },
  ];
}

function teamTicks(
  team: Plan,
  free: Plan,
  sub: "invite" | "brands" | "follow_ups" | "leads",
  used: number | null,
): Tick[] {
  const bee: Tick = {
    bee: true,
    bold: `${team.features.autoReply ? "Worker Bee and " : ""}${n(team.replies)} replies a month`,
    rest: sub === "brands" ? "for all of them" : "for the whole team",
  };
  const accounts: Tick = {
    bee: false,
    bold: plural(team.accounts, "account", "accounts"),
    rest:
      sub === "brands"
        ? "across your businesses"
        : used !== null && used > 0
          ? `you use ${n(used)} now`
          : `${free.name} has ${n(free.accounts)}`,
  };
  const followUps: Tick = {
    bee: false,
    bold: "Follow-ups",
    rest:
      sub === "leads" ? "for people who went quiet" : "your own message to people who went quiet",
  };
  const leads: Tick = { bee: false, bold: "Leads and complaints flagged to you", rest: null };
  switch (sub) {
    case "invite":
      return [
        { bee: false, bold: "Your team", rest: "each person signs in as themselves" },
        accounts,
        bee,
      ];
    case "brands":
      return [
        {
          bee: false,
          bold:
            team.brands === null
              ? "More than one business"
              : `${plural(team.brands, "business", "businesses")}`,
          rest: "each with its own inbox and answers",
        },
        accounts,
        bee,
      ];
    case "follow_ups":
      return [followUps, leads, bee];
    case "leads":
      return [leads, followUps, bee];
  }
}

/** "Instagram and TikTok", "Instagram, TikTok and Threads". */
export function andList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Pure: everything the pop-up says, for one version with what's known. */
export function popupContent(input: PopupInput): PopupContent {
  const { version, plans, trial, founding = false, facts, now } = input;
  const trialDays = input.trialDays ?? TRIAL.days;
  const free = plans.free;
  const solo = plans.solo;
  const planId = offeredBy(version);
  const plan = plans[planId];
  const pay = payWords(plan, free, trial, now, founding, trialDays);
  const used = facts.connected.length > 0 ? facts.connected.length : null;
  const first = facts.connected[0] ? label(facts.connected[0]) : null;
  const scan = facts.scan;
  const scanOn = scan ? label(scan.platform) : null;
  const pain = facts.pain;
  const keepFree = { label: `Keep ${free.name}`, kind: "close" as const };
  const base = {
    plan: planId,
    ticks:
      version.v === "team" ? teamTicks(plan, free, version.sub, used) : soloTicks(solo, free, used),
    note: pay.note,
    cardLabel: pay.cardLabel,
    success: pay.success,
    planName: plan.name,
    price: pay.price,
    keep: keepFree,
    closable: true,
  };
  const roomLeft = (taken: number) => Math.max(0, solo.accounts - taken);
  const compareAccounts = `${free.name} covers ${plural(free.accounts, "account", "accounts")}. ${solo.name} covers ${n(solo.accounts)}.`;

  switch (version.v) {
    case "accounts": {
      const adding = version.platform ? label(version.platform) : null;
      const open = roomLeft(2);
      const buyers = scan && scan.buyers > 0 ? scan.buyers : 0;
      return {
        ...base,
        strip: [
          { title: first ?? "Your account", text: "Connected", tone: "done" },
          { title: adding ?? "+", text: "Adding now", tone: "now" },
          ...(open > 0
            ? [{ title: `+ ${n(open)} more`, text: "open", tone: "open" as const }]
            : []),
        ],
        headline: adding
          ? `Add ${adding} with ${solo.name}`
          : `Connect up to ${n(solo.accounts)} accounts with ${solo.name}`,
        sub: compareAccounts,
        honey:
          buyers > 0 && scanOn
            ? [
                { text: plural(buyers, "person", "people"), bold: true },
                {
                  text: ` wanted to buy on your ${scanOn} and got no answer. Don’t let ${adding ?? "your other accounts"} do the same.`,
                },
              ]
            : null,
      };
    }
    case "accounts_pick": {
      const names = version.picked.map(label);
      const open = roomLeft(names.length);
      return {
        ...base,
        strip: [
          { title: names[0]!, text: "Picked", tone: "done" },
          { title: andList(names.slice(1)), text: "Adding now", tone: "now" },
          ...(open > 0
            ? [{ title: `+ ${n(open)} more`, text: "open", tone: "open" as const }]
            : []),
        ],
        headline: `Connect ${andList(names)} with ${solo.name}`,
        sub: compareAccounts,
        honey: null,
        keep: { label: "Keep one", kind: "close" },
      };
    }
    case "worker_bee": {
      if (version.topic) {
        const t = TOPIC_WORDS[version.topic];
        const waiting = pain?.waiting ?? 0;
        return {
          ...base,
          strip: [
            { title: "You", text: "approve each reply", tone: "done" },
            { title: t.label, text: "Turning on", tone: "now" },
            { title: "Complaints", text: "Ask me first", tone: "open" },
          ],
          headline: `Let Worker Bee answer ${t.phrase}`,
          sub: `On ${free.name} every reply waits for your OK. On ${solo.name}, you choose which ones Worker Bee answers.`,
          honey:
            waiting > 0
              ? [
                  { text: plural(waiting, "message", "messages"), bold: true },
                  { text: ` ${waiting === 1 ? "is" : "are"} waiting for your OK right now.` },
                ]
              : null,
        };
      }
      const locked = scan?.lockedDms ?? 0;
      return {
        ...base,
        strip: [
          { title: "You", text: "approve each reply", tone: "done" },
          { title: "Worker Bee", text: "Turning on", tone: "now" },
          { title: "Asks you", text: "when unsure", tone: "open" },
        ],
        headline: `Turn on Worker Bee with ${solo.name}`,
        sub: `On ${free.name} you approve every reply. On ${solo.name}, Worker Bee answers for you.`,
        honey:
          locked > 0 && scanOn
            ? [
                { text: plural(locked, "DM", "DMs"), bold: true },
                {
                  text: ` on your ${scanOn} went past Meta’s 24-hour window with no reply. Worker Bee answers inside it, day or night.`,
                },
              ]
            : null,
        keep: { label: "Ask me first for now", kind: "close" },
      };
    }
    case "replies": {
      const u = facts.usage;
      const allowance = u?.allowance ?? free.replies;
      const usedReplies = u ? u.used : version.level === "out" ? allowance : null;
      const perDay = pain?.perDay ?? 0;
      const waiting = pain?.waiting ?? 0;
      const strip: StripBox[] = [
        {
          title: usedReplies !== null ? `${n(usedReplies)} of ${n(allowance)}` : n(allowance),
          text: usedReplies !== null ? "used" : `on ${free.name}`,
          tone: "done",
        },
        { title: n(solo.replies), text: `on ${solo.name}`, tone: "now" },
        ...(u ? [{ title: "Resets", text: u.resetsOn, tone: "open" as const }] : []),
      ];
      const day: Seg[] =
        perDay >= 1
          ? [{ text: `~${n(perDay)} messages a day`, bold: true }, { text: " from customers." }]
          : [];
      if (version.level === "out") {
        const tail: Seg[] =
          waiting > 0
            ? [
                { text: day.length ? " " : "" },
                { text: n(waiting), bold: true },
                { text: ` ${waiting === 1 ? "is" : "are"} waiting for a reply right now.` },
              ]
            : [];
        const honey = [...day, ...tail];
        return {
          ...base,
          strip,
          headline: `Keep Waggle answering with ${solo.name}`,
          sub: `${free.name} has ${n(free.replies)} replies a month. ${solo.name} has ${n(solo.replies)}.`,
          honey: honey.length ? honey : null,
          keep: { label: "Answer them myself", kind: "inbox" },
          closable: false,
        };
      }
      const left = u ? Math.max(0, u.allowance - u.used) : null;
      const daysLeft = left !== null && perDay >= 1 ? Math.max(1, Math.ceil(left / perDay)) : null;
      return {
        ...base,
        strip,
        headline: `Get ${n(solo.replies)} replies a month with ${solo.name}`,
        sub: u
          ? `You’ve used ${n(u.used)} of your ${n(u.allowance)} ${free.name} replies this month.`
          : `${free.name} has ${n(free.replies)} replies a month. ${solo.name} has ${n(solo.replies)}.`,
        honey:
          daysLeft !== null
            ? [
                ...day,
                { text: ` At that pace you run out in about ${plural(daysLeft, "day", "days")}.` },
              ]
            : null,
      };
    }
    case "idle": {
      const name = version.platform ? label(version.platform) : null;
      const open = roomLeft(1);
      return {
        ...base,
        strip: [
          { title: name ?? "Your account", text: "Disconnected", tone: "done" },
          { title: "Reconnect", text: `with ${solo.name}`, tone: "now" },
          ...(open > 0
            ? [{ title: `+ ${n(open)} more`, text: "open", tone: "open" as const }]
            : []),
        ],
        headline: name ? `Reconnect ${name} with ${solo.name}` : `Stay connected with ${solo.name}`,
        sub: `${free.name} disconnects accounts after 30 days without a sign-in.`,
        honey: null,
      };
    }
    case "team": {
      const team = plan;
      const both = `${free.name} and ${solo.name}`;
      switch (version.sub) {
        case "invite":
          return {
            ...base,
            strip: [
              { title: "You", text: "Owner", tone: "done" },
              { title: "+ Teammate", text: "Inviting", tone: "now" },
              { title: "+ more", text: "seats", tone: "open" },
            ],
            headline: `Invite your team with ${team.name}`,
            sub: `${both} are just you. ${team.name} adds the people you work with.`,
            honey: null,
          };
        case "brands":
          return {
            ...base,
            strip: [
              { title: facts.brandName ?? "Your business", text: "Your business", tone: "done" },
              { title: "+ Business", text: "Adding now", tone: "now" },
              { title: "+ more", text: "open", tone: "open" },
            ],
            headline: `Add another business with ${team.name}`,
            sub: `${both} cover 1 business. ${team.name} has room for more.`,
            honey: null,
          };
        case "follow_ups":
          return {
            ...base,
            strip: [
              { title: "Asked price", text: "Mon", tone: "done" },
              { title: "Went quiet", text: "3 days", tone: "open" },
              { title: "Follow-up", text: "sent for you", tone: "now" },
            ],
            headline: `Follow up with quiet leads on ${team.name}`,
            sub: `${both} don’t follow up. ${team.name} checks in on people who went quiet.`,
            honey: null,
          };
        case "leads":
          return {
            ...base,
            strip: [
              { title: "Question", text: "answered", tone: "done" },
              { title: "Buyer", text: "flagged to you", tone: "now" },
              { title: "Complaint", text: "flagged", tone: "open" },
            ],
            headline: `See your hottest leads first with ${team.name}`,
            sub: `${team.name} flags buyers and complaints so you see them before anything else.`,
            honey: null,
          };
      }
    }
    case "try": {
      const waiting = pain?.waiting ?? 0;
      if (version.sub === "banner") {
        const extra = Math.max(0, solo.accounts - (used ?? 1));
        return {
          ...base,
          strip: [
            { title: first ?? "Your account", text: "Connected", tone: "done" },
            {
              title: "Worker Bee",
              text: trial ? `${trialDays} days free` : `on ${solo.name}`,
              tone: "now",
            },
            ...(extra > 0
              ? [{ title: `+ ${n(extra)}`, text: "accounts", tone: "open" as const }]
              : []),
          ],
          headline: trial
            ? `Try ${solo.name} free for ${trialDays} days`
            : `Let Worker Bee answer with ${solo.name}`,
          sub: "Worker Bee answers for you. You still decide what it can say.",
          honey:
            waiting > 0
              ? [
                  { text: plural(waiting, "message", "messages"), bold: true },
                  { text: ` ${waiting === 1 ? "is" : "are"} waiting for your OK right now.` },
                ]
              : null,
        };
      }
      const sent = scan ? scan.answeredDms + scan.answeredComments : 0;
      const locked = scan?.lockedDms ?? 0;
      const answered: Seg[] = [];
      if (scan && sent > 0) {
        const parts: Seg[][] = [];
        if (scan.answeredDms > 0)
          parts.push([{ text: plural(scan.answeredDms, "DM", "DMs"), bold: true }]);
        if (scan.answeredComments > 0) {
          parts.push([{ text: plural(scan.answeredComments, "comment", "comments"), bold: true }]);
        }
        answered.push({ text: "You answered the " }, ...parts[0]!);
        if (parts[1]) answered.push({ text: " and " }, ...parts[1]);
        answered.push({ text: " you could." });
      }
      const lockedSegs: Seg[] =
        locked > 0
          ? [
              { text: answered.length ? " " : "" },
              { text: plural(locked, "DM", "DMs"), bold: true },
              {
                text: ` ${locked === 1 ? "was" : "were"} already locked by Meta. Worker Bee keeps that from happening again.`,
              },
            ]
          : [];
      const honey = [...answered, ...lockedSegs].filter((s) => s.text !== "");
      return {
        ...base,
        strip: [
          { title: first ?? "Your account", text: "Connected", tone: "done" },
          ...(sent > 0
            ? [{ title: plural(sent, "reply", "replies"), text: "sent", tone: "done" as const }]
            : []),
          { title: "Worker Bee", text: "Next", tone: "now" },
        ],
        headline: "You’re set up. Want Worker Bee to take it from here?",
        sub: `On ${free.name} you approve every reply. ${solo.name} answers for you, day and night.`,
        honey: honey.length ? honey : null,
      };
    }
  }
}
