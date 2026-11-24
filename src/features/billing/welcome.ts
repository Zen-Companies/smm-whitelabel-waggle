import { PLANS, TRIAL, type Plan, type PlanId } from "./plans";
import { upgradeOffer, type UpgradeOffer } from "./upgrade-offer";

// The welcome pop-up after setup (Walter's flow, 20 Nov), shown once over the Inbox
// (`/inbox?welcome=1`). Free, Solo and Team: it sells the next plan up, leading with what that
// plan adds (Free → Solo: auto-reply first; Solo → Team: leads, follow-ups, the team; Team →
// Business: for agencies, on a call). Business, at the top, is about bringing the team in.
// Numbers come from the plans as staff set them. Never sells what the plan already has. Pure.

export type PerkKey =
  "autoReply" | "leads" | "followUps" | "team" | "room" | "accounts" | "clients" | "setup";

export interface WelcomePerk {
  key: PerkKey;
  title: string;
  body: string;
}

export interface WelcomeContent {
  /** Small line over the title: the plan offered and how it's taken. */
  eyebrow: string;
  title: string;
  /** Why the next plan, in a sentence or two. */
  pitch: string;
  /** What the next plan adds, the best first (shown highlighted). */
  perks: WelcomePerk[];
  /** What they have now, for contrast. Null on Business. */
  now: string | null;
  /** The upgrade to sell (its price banner, button and footnote); null on Business. */
  offer: UpgradeOffer | null;
  /** Bring the team in: the main ask on Business, a side note on Team. */
  team: "main" | "note" | null;
}

const n = (v: number) => v.toLocaleString("en-US");
const accounts = (v: number) => `${n(v)} ${v === 1 ? "account" : "accounts"}`;

function freeToSolo(free: Plan, solo: Plan): Omit<WelcomeContent, "offer" | "team" | "eyebrow"> {
  const times = free.replies > 0 ? Math.round(solo.replies / free.replies) : 0;
  return {
    title: "Let Waggle answer on its own",
    pitch: `Right now every reply waits for your OK. With ${solo.name}, Waggle answers the questions you’ve approved right away, day and night.`,
    perks: [
      ...(solo.features.autoReply
        ? [
            {
              key: "autoReply" as const,
              title: "Auto-reply",
              body: "Prices, hours, where you are: answered the moment people ask, even while you sleep. Anything new or tricky still comes to you.",
            },
          ]
        : []),
      {
        key: "room",
        title: `${n(solo.replies)} AI replies a month`,
        body:
          times >= 2
            ? `${times}× what you have now (${n(free.replies)}), so busy weeks don’t run you out.`
            : `Up from ${n(free.replies)} on ${free.name}.`,
      },
      {
        key: "accounts",
        title: accounts(solo.accounts),
        body: `Up from ${n(free.accounts)}: your accounts answered from one inbox.`,
      },
    ],
    now: `You’re on ${free.name}: ${n(free.replies)} AI replies, ${accounts(free.accounts)}, you OK every reply.`,
  };
}

function soloToTeam(solo: Plan, team: Plan): Omit<WelcomeContent, "offer" | "team" | "eyebrow"> {
  const moreBrands = solo.brands !== null && (team.brands === null || team.brands > solo.brands);
  return {
    title: "Turn messages into sales",
    pitch: `${solo.name} answers questions. ${team.name} helps you close: it spots the people ready to buy and follows up so they don’t go cold.`,
    perks: [
      ...(team.features.leadsFlagged && !solo.features.leadsFlagged
        ? [
            {
              key: "leads" as const,
              title: "Buyers and complaints flagged",
              body: "People ready to order, and unhappy customers, go to the top so you answer them first.",
            },
          ]
        : []),
      ...(team.features.followUps && !solo.features.followUps
        ? [
            {
              key: "followUps" as const,
              title: "Follow-ups",
              body: "A lead that goes quiet gets your follow-up message, without you remembering to send it.",
            },
          ]
        : []),
      ...(team.features.team && !solo.features.team
        ? [
            {
              key: "team" as const,
              title: "Your team",
              body: "Add staff with roles. They approve replies, you keep control of settings and billing.",
            },
          ]
        : []),
      {
        key: "room",
        title: `${accounts(team.accounts)}, ${n(team.replies)} AI replies`,
        body: moreBrands
          ? `Up from ${n(solo.accounts)} and ${n(solo.replies)}, and room for more than one business.`
          : `Up from ${n(solo.accounts)} and ${n(solo.replies)} on ${solo.name}.`,
      },
    ],
    now: `You’re on ${solo.name}: ${accounts(solo.accounts)}, ${n(solo.replies)} AI replies${solo.features.autoReply ? ", auto-reply" : ""}.`,
  };
}

function teamToBusiness(team: Plan, biz: Plan): Omit<WelcomeContent, "offer" | "team" | "eyebrow"> {
  return {
    title: "Run socials for your clients",
    pitch: `Managing several businesses or clients? ${biz.name} is sized for agencies and set up with you.`,
    perks: [
      {
        key: "room",
        title: `${n(biz.accounts)}+ accounts, about ${n(biz.replies)} AI replies`,
        body: `Up from ${n(team.accounts)} and ${n(team.replies)} on ${team.name}.`,
      },
      // Separate businesses only when Team really limits them (Staff → Plans can change both).
      ...(team.brands !== null && (biz.brands === null || biz.brands > team.brands)
        ? [
            {
              key: "clients" as const,
              title: "Every client separate",
              body: "Each with its own inbox, business info and accounts, with role access per person.",
            },
          ]
        : []),
      {
        key: "setup",
        title: "Set up with you",
        body: `Custom price: we set ${biz.name} up with you on a short call, priced for how many clients you run.`,
      },
    ],
    now: `You’re on ${team.name}: ${accounts(team.accounts)}, ${n(team.replies)} AI replies${team.features.team ? ", your team" : ""}.`,
  };
}

/** Business, the top: what it does (nothing to sell). */
function businessPerks(biz: Plan): WelcomePerk[] {
  const f = biz.features;
  return [
    ...(biz.brands === null || biz.brands > 1
      ? [
          {
            key: "clients" as const,
            title: "Every business or client, separate",
            body: "Each with its own inbox, business info and accounts.",
          },
        ]
      : []),
    ...(f.autoReply
      ? [
          {
            key: "autoReply" as const,
            title: "Auto-reply",
            body: "Answers approved questions right away, day and night.",
          },
        ]
      : []),
    ...(f.leadsFlagged
      ? [
          {
            key: "leads" as const,
            title: "Buyers and complaints flagged",
            body: "Buyers and unhappy customers go to the top.",
          },
        ]
      : []),
    ...(f.followUps
      ? [
          {
            key: "followUps" as const,
            title: "Follow-ups",
            body: "Leads that go quiet get your follow-up message.",
          },
        ]
      : []),
    {
      key: "room",
      title: `${accounts(biz.accounts)}, ${n(biz.replies)} AI replies a month`,
      body: "Add more any time from Your plan.",
    },
  ];
}

/** Pure: the welcome pop-up for the organization's plan. `trial`: its first paid plan starts with its first month free. */
export function welcomeFor(
  current: PlanId,
  plans: Record<PlanId, Plan> = PLANS,
  ctx: { trial: boolean; trialDays?: number } = { trial: false },
): WelcomeContent {
  if (current === "team") {
    return {
      eyebrow: `You’re on ${plans.team.name}`,
      title: "Everything Waggle can do",
      pitch:
        "Your whole plan is on. Here’s what Waggle does for you, and who you can bring in to help.",
      perks: businessPerks(plans.team),
      now: null,
      offer: null,
      team: plans.team.features.team ? "main" : null,
    };
  }
  const offer = upgradeOffer(current, "nudge", plans, ctx);
  const next = offer.next ? plans[offer.next] : null;
  const eyebrow = !next
    ? ""
    : offer.via === "trial"
      ? `${next.name} · ${(ctx.trialDays ?? TRIAL.days) === TRIAL.days ? "first month free" : `${ctx.trialDays} days free`}`
      : offer.via === "call"
        ? `${next.name} · custom price`
        : `${next.name} · $${next.monthlyUsd} a month`;
  if (current === "free") {
    return { ...freeToSolo(plans.free, plans.solo), eyebrow, offer, team: null };
  }
  if (current === "solo") {
    return { ...soloToTeam(plans.solo, plans.business), eyebrow, offer, team: null };
  }
  return {
    ...teamToBusiness(plans.business, plans.team),
    eyebrow,
    offer,
    team: plans.business.features.team ? "note" : null,
  };
}
