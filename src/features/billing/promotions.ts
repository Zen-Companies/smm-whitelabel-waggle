// Promotions in the app (board "Promotions in the app", approved 24 Nov). Pure.
//
// One typed list every promotion surface reads: the moving bar above the navbar, the pass on Your
// plan, the invite card on sign-up and the success moment after checkout. Code constants for now,
// shaped like the records our team will edit later (admin, then a table): each promotion has its
// own dates, texts and bar settings, so the referral program can run a bar on its own.
// The free month itself (trial days at checkout) stays in promo.ts, which reads its dates here.

export type PromotionKind = "seasonal" | "referral";

/** Who sees a promotion's bar. */
export type BarAudience = "never_paid_owners" | "all_owners" | "everyone";

export const BAR_AUDIENCES: readonly BarAudience[] = [
  "never_paid_owners",
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

/** A different face for the last day (Cyber Monday): from `startsAt` to the promotion's end. */
export interface LastDay {
  startsAt: Date;
  bar: BarCopy;
  pass: PassCopy;
}

export interface Promotion {
  id: string;
  /** Staff's name for it ("Black Friday 2026"). */
  name: string;
  kind: PromotionKind;
  enabled: boolean;
  /** null: already running. */
  startsAt: Date | null;
  /** null: no end (the referral program until a date is set). */
  endsAt: Date | null;
  /** Days free on the first plan checkout. */
  trialDays: number;
  /** Your plan: show "Ends in N days". */
  countdown: boolean;
  /** Referral program: months credited to the referrer per friend's first payment. */
  rewardMonths: number;
  bar: PromoBar;
  pass: PassCopy;
  lastDay: LastDay | null;
}

/** US Eastern: the promotions' dates and "Ends in N days" count in it. */
export const PROMO_TIME_ZONE = "America/New_York";

/** Sign-up for a friend's link, and the success line. `{name}` is the referrer's business name. */
export const REFERRAL_COPY = {
  panelKicker: "An invite from {name}",
  panelKickerUnknown: "You’re invited",
  panelTitle: "They let Waggle answer their DMs.",
  panelTitleHoney: "Your turn.",
  panelTitleUnknown: "Waggle answers your DMs.",
  panelSub: "Start on Free. When you pick a plan, the first month is on them.",
  cardKicker: "Invited by {name}",
  cardKickerUnknown: "You’re invited",
  cardTitle: "{name} gave you a month of Waggle",
  cardTitleUnknown: "A friend gave you a month of Waggle",
  cardOffer: "Your first month on any paid plan is free.",
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
    // Tuesday 1 December 2026, 11:59 pm Eastern (= 2 December 04:59:59 UTC): extended a day
    // for Walter's GHL campaign (24 Nov), the same end as the referral offer.
    endsAt: new Date("2026-12-02T04:59:59Z"),
    trialDays: 30,
    countdown: true,
    rewardMonths: 1,
    bar: {
      enabled: true,
      audience: "never_paid_owners",
      startsAt: null,
      endsAt: null,
      link: "plan-popup",
      label: "Black Friday",
      lines: [
        { text: "Your first month on any plan is free" },
        { text: "Choose a plan by Tue 1 Dec, 11:59 pm ET" },
        { text: "Give a month, get a month: ", honey: "refer a friend" },
      ],
      phoneLines: [{ text: "First month free on any plan" }, { text: "Ends Tue 1 Dec" }],
      cta: "Choose a plan →",
      phoneCta: "Plans →",
    },
    pass: {
      dayName: ["Black", "Friday"],
      headline: "Your first month is free.",
      small: "Choose any plan by Tuesday, 1 Dec · 11:59 pm ET. Card today, $0 until 30 days later.",
    },
    lastDay: {
      // Tuesday 1 December, 00:00 Eastern: the last day since the extension (24 Nov).
      startsAt: new Date("2026-12-01T05:00:00Z"),
      bar: {
        label: "Last day",
        lines: [
          { text: "Last day: your first month on any plan is free" },
          { text: "Ends tonight, 11:59 pm ET" },
          { text: "Give a month, get a month: ", honey: "refer a friend" },
        ],
        phoneLines: [{ text: "Last day: first month free" }, { text: "Ends tonight" }],
        cta: "Choose a plan →",
        phoneCta: "Plans →",
      },
      pass: {
        dayName: ["Last", "Day"],
        headline: "Last day: your first month is free.",
        small: "Choose any plan before 11:59 pm ET tonight.",
      },
    },
  },
  {
    id: "give-a-month",
    name: "Give a month, get a month",
    kind: "referral",
    enabled: true,
    startsAt: null,
    // Walter's GHL campaign (24 Nov): "give a month, get a month" runs through Tuesday 1 December,
    // 11:59 pm Eastern. null would keep it running (Staff → Promotions can move it).
    endsAt: new Date("2026-12-02T04:59:59Z"),
    trialDays: 30,
    countdown: false,
    rewardMonths: 1,
    // Its own bar, off for now: our team turns it on (and picks who sees it) when wanted.
    bar: {
      enabled: false,
      audience: "all_owners",
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
      small: "{name} sent you. It’s on any paid plan you choose, no code needed.",
    },
    lastDay: null,
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

/** Pure: whether the last-day face shows. */
export function isLastDay(p: Promotion, now: Date): boolean {
  return !!p.lastDay && now.getTime() >= p.lastDay.startsAt.getTime();
}

export interface Viewer {
  /** Manages the bill (billing.view). */
  isOwner: boolean;
  /** The organization never had a paid plan. */
  neverPaid: boolean;
}

/** Pure: whether a bar's audience includes this viewer. */
export function audienceIncludes(audience: BarAudience, v: Viewer): boolean {
  if (audience === "everyone") return true;
  if (!v.isOwner) return false;
  return audience === "all_owners" || v.neverPaid;
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
    const copy = isLastDay(p, now) && p.lastDay ? p.lastDay.bar : p.bar;
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

/** Pure: whole calendar days from `now` to `endsAt`, counted in `timeZone` (0 on the last day). */
export function daysLeft(now: Date, endsAt: Date, timeZone: string = PROMO_TIME_ZONE): number {
  const a = Date.parse(`${dayKey(now, timeZone)}T00:00:00Z`);
  const b = Date.parse(`${dayKey(endsAt, timeZone)}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Pure: the countdown chip: "Ends in 6 days", "Ends tomorrow", "Ends tonight". */
export function endsInLabel(now: Date, endsAt: Date, timeZone: string = PROMO_TIME_ZONE): string {
  const d = daysLeft(now, endsAt, timeZone);
  if (d <= 0) return "Ends tonight";
  if (d === 1) return "Ends tomorrow";
  return `Ends in ${d} days`;
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
  /** "Ends in 6 days" / "Ends tonight", or none. */
  chip: string | null;
  trialDays: number;
}

/**
 * Pure: the pass on Your plan, for an Owner of a never-paid organization. The seasonal promotion
 * first; after it, the referral month when the organization came from a friend's link (never
 * both, like the trial itself).
 */
export function passFor(
  input: { now: Date; referred: boolean; referrerName: string | null },
  list: readonly Promotion[] = PROMOTIONS,
): PassView | null {
  const { now } = input;
  const season = activeSeasonal(now, list);
  if (season) {
    const last = isLastDay(season, now) && season.lastDay ? season.lastDay.pass : null;
    const copy = last ?? season.pass;
    return {
      promotionId: season.id,
      kind: "seasonal",
      dayName: copy.dayName,
      headline: copy.headline,
      small: copy.small,
      chip: season.countdown && season.endsAt ? endsInLabel(now, season.endsAt) : null,
      trialDays: season.trialDays,
    };
  }
  const referral = list.find((p) => p.kind === "referral" && promotionOn(p, now));
  if (!referral || !input.referred) return null;
  return {
    promotionId: referral.id,
    kind: "referral",
    dayName: referral.pass.dayName,
    headline: referral.pass.headline,
    small: fill(referral.pass.small, { name: input.referrerName ?? "A friend" }),
    chip: null,
    trialDays: referral.trialDays,
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
  const referral = list.find((p) => p.kind === "referral");
  const name = input.name?.trim() || null;
  if (!referral || !promotionOn(referral, input.now)) return { kind: "ended", name };
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
