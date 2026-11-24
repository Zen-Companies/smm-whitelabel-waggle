// Promotions in the app (board "Promotions in the app", approved 24 Nov). Pure.
//
// One typed list every promotion surface reads: the moving bar above the navbar, the pass on Your
// plan, the invite card on sign-up and the success moment after checkout. Code constants for now,
// shaped like the records our team will edit later (admin, then a table): each promotion has its
// own dates, texts and bar settings, so the referral program can run a bar on its own.
// The free month itself (trial days at checkout) stays in promo.ts, which reads its dates here.
//
// Pricing Bible, 24 Nov (final): the offer never states an end date in public. A promotion's
// end date only switches it off; no bar, pass or line ever shows a date or a countdown.

export type PromotionKind = "seasonal" | "referral";

/**
 * Who sees a promotion's bar. Paying Owners: a paid plan with its card, live (the referral bar:
 * only they can refer, Pricing Bible).
 */
export type BarAudience = "never_paid_owners" | "paying_owners" | "all_owners" | "everyone";

export const BAR_AUDIENCES: readonly BarAudience[] = [
  "never_paid_owners",
  "paying_owners",
  "all_owners",
  "everyone",
];

/** One piece of the bar's text: plain, then an optional honey tail ("refer a friend"). */
export interface BarLine {
  text: string;
  honey?: string;
}

export interface BarCopy {
  /** The honey label first in the bar ("BLACK FRIDAY"). */
  label: string;
  /** Computer: the lines that drift by. */
  lines: BarLine[];
  /** Phone: shorter lines. */
  phoneLines: BarLine[];
  /** The link at the end: "Choose a plan →" / phone "Plans →". */
  cta: string;
  phoneCta: string;
}

export interface PromoBar extends BarCopy {
  enabled: boolean;
  audience: BarAudience;
  /** null: the promotion's own dates. */
  startsAt: Date | null;
  endsAt: Date | null;
  /** "plan-popup" opens the plan pop-up over the page; otherwise a path. */
  link: "plan-popup" | string;
}

export interface PassCopy {
  /** The outlined day name, two lines: ["Black", "Friday"]. */
  dayName: [string, string];
  /** "Your first month is free." (the last word in honey). */
  headline: string;
  /** The small line. `{name}` is the referrer's business name. */
  small: string;
}

export interface Promotion {
  id: string;
  /** Staff's name for it ("Black Friday 2026"). */
  name: string;
  kind: PromotionKind;
  enabled: boolean;
  /** null: already running. */
  startsAt: Date | null;
  /** null: no end. Only switches it off: never shown to owners (24 Nov). */
  endsAt: Date | null;
  /** Days free on the first plan checkout (never fewer than the usual first month). */
  trialDays: number;
  /** Referral program: months credited to the referrer per friend's first payment. */
  rewardMonths: number;
  bar: PromoBar;
  pass: PassCopy;
}

/** US Eastern: the promotions' dates are typed in it on Staff → Promotions. */
export const PROMO_TIME_ZONE = "America/New_York";

/** Sign-up for a friend's link, and the success line. `{name}` is the referrer's business name. */
export const REFERRAL_COPY = {
  panelKicker: "An invite from {name}",
  panelKickerUnknown: "You’re invited",
  panelTitle: "They let Waggle answer their DMs.",
  panelTitleHoney: "Your turn.",
  panelTitleUnknown: "Waggle answers your DMs.",
  panelSub: "Start on Free. When you pick Solo or Team, the first month is on them.",
  cardKicker: "Invited by {name}",
  cardKickerUnknown: "You’re invited",
  cardTitle: "{name} gave you a month of Waggle",
  cardTitleUnknown: "A friend gave you a month of Waggle",
  cardOffer: "Your first month on Solo or Team is free.",
  cardApplied: "Applied automatically at checkout",
  endedTitle: "{name} invited you",
  endedTitleUnknown: "A friend invited you",
  endedSub: "Their free-month offer has ended. You can still start on Free.",
  successFriend:
    "{name}’s month is on. They get a month free too once your first payment goes through.",
  successFriendUnknown:
    "Your friend’s month is on. They get a month free too once your first payment goes through.",
  successBanked: "+{n} from friends you brought. Included in the date above.",
} as const;

export const PROMOTIONS: readonly Promotion[] = [
  {
    id: "black-friday-2026",
    name: "Black Friday 2026",
    kind: "seasonal",
    enabled: true,
    startsAt: null,
    // No end date (Pricing Bible, 24 Nov): the offer runs until our team switches it off, and the
    // app never says when it ends. A date set on Staff → Promotions only switches it off.
    endsAt: null,
    trialDays: 30,
    rewardMonths: 1,
    bar: {
      enabled: true,
      audience: "never_paid_owners",
      startsAt: null,
      endsAt: null,
      link: "plan-popup",
      label: "Black Friday",
      lines: [
        { text: "Your first month is free on Solo and Team" },
        { text: "Card today, $0 for 30 days. We email you before the first charge" },
        { text: "Give a month, get a month: ", honey: "refer a friend" },
      ],
      phoneLines: [{ text: "First month free on Solo and Team" }],
      cta: "Choose a plan →",
      phoneCta: "Plans →",
    },
    pass: {
      dayName: ["Black", "Friday"],
      headline: "Your first month is free.",
      small:
        "Black Friday: your first month is free on Solo and Team. Card today, $0 for 30 days, and we email you before the first charge.",
    },
  },
  {
    id: "give-a-month",
    name: "Give a month, get a month",
    kind: "referral",
    enabled: true,
    startsAt: null,
    // Pricing Bible, 24 Nov: give a month, get a month runs everyday, with no end date shown
    // (Staff → Promotions can still set one to switch it off).
    endsAt: null,
    trialDays: 30,
    rewardMonths: 1,
    // Its own bar, off for now: our team turns it on (and picks who sees it) when wanted. Paying
    // Owners only: nobody else can refer.
    bar: {
      enabled: false,
      audience: "paying_owners",
      startsAt: null,
      endsAt: null,
      link: "/plan#referral-title",
      label: "Give a month, get a month",
      lines: [
        { text: "Send a friend your link: ", honey: "their first month is free" },
        { text: "You get a month free after their first payment" },
      ],
      phoneLines: [{ text: "Refer a friend: ", honey: "a month free" }],
      cta: "Get your link →",
      phoneCta: "Link →",
    },
    pass: {
      dayName: ["A friend’s", "month"],
      headline: "Your first month is free.",
      small: "{name} sent you. It’s on Solo or Team, no code needed.",
    },
  },
];

// ---- Helpers ----

/** What Staff → Promotions shows for a promotion. */
export type PromotionStatus = "running" | "scheduled" | "ended" | "off";

/** Pure: Running / Scheduled / Ended / Off at `now`. Off wins: a switched-off promotion never runs. */
export function promotionStatus(
  p: Pick<Promotion, "enabled" | "startsAt" | "endsAt">,
  now: Date,
): PromotionStatus {
  if (!p.enabled) return "off";
  if (p.startsAt && now.getTime() < p.startsAt.getTime()) return "scheduled";
  if (p.endsAt && now.getTime() > p.endsAt.getTime()) return "ended";
  return "running";
}

/**
 * Pure: the bar's lines from staff's text: one line each, blank lines dropped; a honey tail is
 * wrapped in stars at the end ("Give a month, get a month: *refer a friend*").
 */
export function parseBarText(text: string): BarLine[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^(.*?)\*([^*]+)\*$/.exec(l);
      return m ? { text: m[1], honey: m[2] } : { text: l };
    });
}

/** Pure: the reverse of parseBarText, for the edit form. */
export function barTextOf(lines: readonly BarLine[]): string {
  return lines.map((l) => (l.honey ? `${l.text}*${l.honey}*` : l.text)).join("\n");
}

/** Pure: `{name}` filled in. */
export function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/** Pure: whether `now` is inside [startsAt, endsAt] (null ends are open). */
export function within(now: Date, startsAt: Date | null, endsAt: Date | null): boolean {
  const t = now.getTime();
  return (!startsAt || t >= startsAt.getTime()) && (!endsAt || t <= endsAt.getTime());
}

/** Pure: whether a promotion runs at `now`. */
export function promotionOn(p: Promotion, now: Date): boolean {
  return p.enabled && within(now, p.startsAt, p.endsAt);
}

export function promotionById(
  id: string,
  list: readonly Promotion[] = PROMOTIONS,
): Promotion | null {
  return list.find((p) => p.id === id) ?? null;
}

/** The first promotion of a kind (the code constants have one of each). */
export function promotionOfKind(
  kind: PromotionKind,
  list: readonly Promotion[] = PROMOTIONS,
): Promotion {
  const p = list.find((x) => x.kind === kind);
  if (!p) throw new Error(`promotions: no ${kind} promotion`);
  return p;
}

/** Pure: the running seasonal promotion, if any. */
export function activeSeasonal(
  now: Date,
  list: readonly Promotion[] = PROMOTIONS,
): Promotion | null {
  return list.find((p) => p.kind === "seasonal" && promotionOn(p, now)) ?? null;
}

/**
 * Pure: the referral program running at `at` (on, inside its dates), if any. Every referral
 * decision reads this one: the friend's month, the pass, the invite card and the referrer's reward.
 * `at` is now, or when the friend signed up (a friend who joined while it ran keeps the month).
 */
export function runningReferral(
  at: Date,
  list: readonly Promotion[] = PROMOTIONS,
): Promotion | null {
  return list.find((p) => p.kind === "referral" && promotionOn(p, at)) ?? null;
}

export interface Viewer {
  /** Manages the bill (billing.view). */
  isOwner: boolean;
  /** The organization never had a paid plan. */
  neverPaid: boolean;
  /** The organization is paying now (a paid plan with its card, live). */
  paying: boolean;
}

/** Pure: whether a bar's audience includes this viewer. */
export function audienceIncludes(audience: BarAudience, v: Viewer): boolean {
  if (audience === "everyone") return true;
  if (!v.isOwner) return false;
  if (audience === "all_owners") return true;
  if (audience === "paying_owners") return v.paying;
  return v.neverPaid;
}

export interface ActiveBar {
  promotionId: string;
  copy: BarCopy;
  link: PromoBar["link"];
}

/** Pure: the bar this viewer sees now (the first that applies), or none. */
export function activeBar(
  now: Date,
  viewer: Viewer,
  list: readonly Promotion[] = PROMOTIONS,
): ActiveBar | null {
  for (const p of list) {
    if (!promotionOn(p, now) || !p.bar.enabled) continue;
    if (!within(now, p.bar.startsAt, p.bar.endsAt)) continue;
    if (!audienceIncludes(p.bar.audience, viewer)) continue;
    const copy = p.bar;
    return {
      promotionId: p.id,
      link: p.bar.link,
      copy: {
        label: copy.label,
        lines: copy.lines,
        phoneLines: copy.phoneLines,
        cta: copy.cta,
        phoneCta: copy.phoneCta,
      },
    };
  }
  return null;
}

/** Pure: "2026-11-24", the calendar day of `now` in `timeZone`. */
export function dayKey(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

// The bar's × hides it for the rest of the viewer's day: a cookie the server reads, so a hidden
// bar never flashes in. Value: "<promotion id>.<YYYY-MM-DD in the viewer's zone>".
export const BAR_COOKIE = "waggle_promo_bar_hidden";
/** Two days covers any time zone; the day inside the value decides. */
export const BAR_COOKIE_MAX_AGE_S = 2 * 24 * 60 * 60;

/** Pure: the cookie's value for hiding `promotionId` today. */
export function barHiddenValue(promotionId: string, now: Date, timeZone: string): string {
  return `${promotionId}.${dayKey(now, timeZone)}`;
}

/** Pure: whether the bar was hidden today (in the viewer's zone) for this promotion. */
export function barHiddenToday(
  cookie: string | null | undefined,
  promotionId: string,
  now: Date,
  timeZone: string,
): boolean {
  if (!cookie) return false;
  return decodeURIComponent(cookie) === barHiddenValue(promotionId, now, timeZone);
}

export interface PassView {
  promotionId: string;
  kind: PromotionKind;
  dayName: [string, string];
  headline: string;
  small: string;
  trialDays: number;
}

/**
 * Pure: the pass on Your plan, for an Owner of a never-paid organization. The seasonal promotion
 * first; after it, the referral month when the organization came from a friend's link (never
 * both, like the trial itself).
 */
export function passFor(
  input: {
    now: Date;
    referred: boolean;
    referrerName: string | null;
    /** When the friend signed up: the referral program that ran then still gives the month. */
    referredAt?: Date | null;
    /**
     * The friend's free days stored on the referral row at sign-up (0: none). Wins over the
     * program's switch, so turning it off never takes back a month already given. null: a row
     * from before they were stored.
     */
    referralTrialDays?: number | null;
  },
  list: readonly Promotion[] = PROMOTIONS,
): PassView | null {
  const { now } = input;
  const season = activeSeasonal(now, list);
  if (season) {
    // Never a date or a countdown (24 Nov), even when the promotion has an end date.
    return {
      promotionId: season.id,
      kind: "seasonal",
      dayName: season.pass.dayName,
      headline: season.pass.headline,
      small: season.pass.small,
      trialDays: season.trialDays,
    };
  }
  if (!input.referred) return null;
  const stored = input.referralTrialDays ?? null;
  if (stored !== null && stored <= 0) return null;
  const referral =
    runningReferral(input.referredAt ?? now, list) ??
    (stored !== null ? (list.find((p) => p.kind === "referral") ?? null) : null);
  if (!referral) return null;
  return {
    promotionId: referral.id,
    kind: "referral",
    dayName: referral.pass.dayName,
    headline: referral.pass.headline,
    small: fill(referral.pass.small, { name: input.referrerName ?? "A friend" }),
    trialDays: stored ?? referral.trialDays,
  };
}

/** Pure: a "free." headline split so its last word can be honey. */
export function splitLastWord(text: string): [string, string] {
  const i = text.trimEnd().lastIndexOf(" ");
  return i < 0 ? ["", text] : [text.slice(0, i + 1), text.slice(i + 1)];
}

/** Sign-up from a friend's link: which card shows. */
export type InviteState =
  | { kind: "none" }
  | { kind: "invite"; name: string | null }
  | { kind: "ended"; name: string | null };

/** Pure: the invite card for a friend's code (unknown code: none, the normal sign-up). */
export function inviteState(
  input: { known: boolean; name: string | null; now: Date },
  list: readonly Promotion[] = PROMOTIONS,
): InviteState {
  if (!input.known) return { kind: "none" };
  const name = input.name?.trim() || null;
  if (!runningReferral(input.now, list)) return { kind: "ended", name };
  return { kind: "invite", name };
}

/** Pure: "24 Dec", the success modal's date. */
export function shortDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Pure: the success modal's promo lines, from the checkout's own record (Stripe metadata). */
export function successLines(input: {
  promo: string | null | undefined;
  bankedMonths: number;
  referrerName: string | null;
}): string[] {
  const reasons = (input.promo ?? "").split(",");
  const out: string[] = [];
  if (reasons.includes("referral")) {
    out.push(
      input.referrerName
        ? fill(REFERRAL_COPY.successFriend, { name: input.referrerName })
        : REFERRAL_COPY.successFriendUnknown,
    );
  }
  const n = Math.max(0, Math.floor(input.bankedMonths));
  if (n > 0) {
    out.push(fill(REFERRAL_COPY.successBanked, { n: n === 1 ? "1 month" : `${n} months` }));
  }
  return out;
}
