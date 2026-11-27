import { z } from "zod";

// Google Business posts (Posts Round 4, approved 26 Nov): an Update, an Offer or an Event, and a
// button. Pure; tested. Field names follow Zernio's googlebusiness `platformSpecificData`
// (docs.zernio.com/platforms/google-business/reference, /events-offers, /posts, read 26 Nov):
//   topicType  STANDARD (default) | EVENT | OFFER
//   event      { title, schedule: { startDate, endDate, startTime?, endTime? } }, dates
//              { year, month, day }, times { hours, minutes }. Required for EVENT; on an OFFER it
//              gives the offer its heading and dates.
//   offer      { couponCode?, redeemOnlineUrl?, termsConditions? }, all optional.
//   callToAction { type: LEARN_MORE | BOOK | ORDER | SHOP | SIGN_UP | CALL, url } (the SDK marks
//              `url` required whenever a button is given, CALL included).
// VERIFY outcome (26 Nov): Zernio's docs and SDK list a url for every button, CALL too, and
// say nothing else about CALL, so Call now sends `tel:` + the business phone from Business info;
// with no phone there, Call now is hidden. Zernio's dry run (validatePost) checks it before the
// post is saved, so a refusal shows in "Before it goes out", never after posting.

export const GOOGLE_KINDS = ["update", "offer", "event"] as const;
export type GoogleKind = (typeof GOOGLE_KINDS)[number];

export const GOOGLE_BUTTONS = ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"] as const;
export type GoogleButton = (typeof GOOGLE_BUTTONS)[number];

/** The chip's word in Waggle, and what Google writes on the button. */
export const BUTTON_WORDS: Record<GoogleButton, { chip: string; google: string }> = {
  BOOK: { chip: "Book", google: "Book" },
  ORDER: { chip: "Order", google: "Order online" },
  SHOP: { chip: "Shop", google: "Buy" },
  LEARN_MORE: { chip: "Learn more", google: "Learn more" },
  SIGN_UP: { chip: "Sign up", google: "Sign up" },
  CALL: { chip: "Call now", google: "Call now" },
};

/** Google's own limits: an event or offer title is 58 characters, a coupon code 58. */
export const GOOGLE_TITLE_MAX = 58;
export const GOOGLE_COUPON_MAX = 58;
export const GOOGLE_TERMS_MAX = 5000;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** What the owner picked for Google, kept in `posts.platform_options.googlebusiness.google`. */
export const googleOptionsSchema = z.object({
  kind: z.enum(GOOGLE_KINDS).catch("update"),
  title: z.string().max(200).optional().catch(undefined),
  /** "YYYY-MM-DD" (an offer) or with a time: day + "HH:MM" (an event). */
  startDay: z.string().regex(DAY).optional().catch(undefined),
  startTime: z.string().regex(TIME).optional().catch(undefined),
  endDay: z.string().regex(DAY).optional().catch(undefined),
  endTime: z.string().regex(TIME).optional().catch(undefined),
  coupon: z.string().max(200).optional().catch(undefined),
  redeemUrl: z.string().max(2000).optional().catch(undefined),
  terms: z
    .string()
    .max(GOOGLE_TERMS_MAX * 2)
    .optional()
    .catch(undefined),
  button: z.enum(GOOGLE_BUTTONS).optional().catch(undefined),
  /** The button's link; for Call now the server sets `tel:` + the business phone. */
  buttonUrl: z.string().max(2000).optional().catch(undefined),
});
export type GoogleOptions = z.infer<typeof googleOptionsSchema>;

/** A link Google takes: https:// and a real host. */
export function isHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** "harbourbakery.ph/order" → "https://harbourbakery.ph/order" (owners skip the scheme). */
export function withHttps(value: string): string {
  const v = value.trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v)) return v.replace(/^http:\/\//i, "https://");
  return `https://${v}`;
}

export interface GoogleProblem {
  field: "title" | "start" | "end" | "redeemUrl" | "buttonUrl" | "button" | "coupon" | "terms";
  message: string;
}

/**
 * What's missing or wrong before the post can go to Google, in the owner's words. `phone` is the
 * business phone Waggle has (Call now needs it).
 */
export function googleProblems(
  o: GoogleOptions | undefined,
  phone: string | null,
): GoogleProblem[] {
  if (!o) return [];
  const out: GoogleProblem[] = [];
  const titled = o.kind === "offer" || o.kind === "event";
  if (titled) {
    const what = o.kind === "offer" ? "offer" : "event";
    const title = o.title?.trim() ?? "";
    if (!title) out.push({ field: "title", message: `Give the ${what} a title.` });
    else if (title.length > GOOGLE_TITLE_MAX) {
      out.push({
        field: "title",
        message: `Google takes ${GOOGLE_TITLE_MAX} characters for a title. Shorten it by ${title.length - GOOGLE_TITLE_MAX}.`,
      });
    }
    if (!o.startDay) out.push({ field: "start", message: `Pick when the ${what} starts.` });
    if (!o.endDay) out.push({ field: "end", message: `Pick when the ${what} ends.` });
    if (o.startDay && o.endDay) {
      const start = `${o.startDay}T${o.kind === "event" ? (o.startTime ?? "00:00") : "00:00"}`;
      const end = `${o.endDay}T${o.kind === "event" ? (o.endTime ?? "23:59") : "23:59"}`;
      if (end < start) out.push({ field: "end", message: `The ${what} ends before it starts.` });
    }
  }
  if (o.kind === "offer") {
    if ((o.coupon?.trim().length ?? 0) > GOOGLE_COUPON_MAX) {
      out.push({
        field: "coupon",
        message: `Google takes ${GOOGLE_COUPON_MAX} characters for a code.`,
      });
    }
    if (o.redeemUrl?.trim() && !isHttpsUrl(withHttps(o.redeemUrl))) {
      out.push({ field: "redeemUrl", message: "The redeem link must be a web address." });
    }
    if ((o.terms?.trim().length ?? 0) > GOOGLE_TERMS_MAX) {
      out.push({ field: "terms", message: "The terms are too long for Google." });
    }
  }
  if (o.button === "CALL") {
    if (!phone) {
      out.push({
        field: "button",
        message: "Call now needs your phone number. Add it in Teach Waggle, Business info.",
      });
    }
  } else if (o.button) {
    if (!o.buttonUrl?.trim()) {
      out.push({
        field: "buttonUrl",
        message: `Add the link for ${BUTTON_WORDS[o.button].chip}.`,
      });
    } else if (!isHttpsUrl(withHttps(o.buttonUrl))) {
      out.push({ field: "buttonUrl", message: "The link must start with https://" });
    }
  }
  return out;
}

const dateParts = (day: string) => {
  const [year, month, d] = day.split("-").map(Number);
  return { year, month, day: d };
};
const timeParts = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours, minutes };
};

/**
 * Zernio's googlebusiness `platformSpecificData` for these choices. Fields the kind doesn't use
 * are left out (an Update sends no event, an Event no offer). `phone`: the business phone, for a
 * Call now button (`tel:`). A button with no usable link is left out (the composer blocks it
 * before; this is the last guard).
 */
export function googlePlatformData(
  o: GoogleOptions | undefined,
  phone: string | null,
): Record<string, unknown> {
  if (!o) return {};
  const d: Record<string, unknown> = {};
  const titled = (o.kind === "offer" || o.kind === "event") && o.title?.trim();
  if (titled && o.startDay && o.endDay) {
    const timed = o.kind === "event";
    d.event = {
      title: o.title!.trim().slice(0, GOOGLE_TITLE_MAX),
      schedule: {
        startDate: dateParts(o.startDay),
        ...(timed && o.startTime ? { startTime: timeParts(o.startTime) } : {}),
        endDate: dateParts(o.endDay),
        ...(timed && o.endTime ? { endTime: timeParts(o.endTime) } : {}),
      },
    };
  }
  if (o.kind === "event" && d.event) d.topicType = "EVENT";
  if (o.kind === "offer") {
    d.topicType = "OFFER";
    const coupon = o.coupon?.trim();
    const redeem = o.redeemUrl?.trim() ? withHttps(o.redeemUrl) : "";
    const terms = o.terms?.trim();
    d.offer = {
      ...(coupon ? { couponCode: coupon.slice(0, GOOGLE_COUPON_MAX) } : {}),
      ...(redeem && isHttpsUrl(redeem) ? { redeemOnlineUrl: redeem } : {}),
      ...(terms ? { termsConditions: terms.slice(0, GOOGLE_TERMS_MAX) } : {}),
    };
  }
  if (o.button === "CALL") {
    // The server stores `tel:` + the business phone when the post is saved.
    const tel = /^tel:\+?\d{6,15}$/.test(o.buttonUrl ?? "") ? o.buttonUrl! : telUrl(phone);
    if (tel) d.callToAction = { type: "CALL", url: tel };
  } else if (o.button && o.buttonUrl?.trim()) {
    const url = withHttps(o.buttonUrl);
    if (isHttpsUrl(url)) d.callToAction = { type: o.button, url };
  }
  return d;
}

/** "+63 2 8555 0142" → "tel:+63285550142"; null when it isn't a phone number. */
export function telUrl(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const plus = phone.trim().startsWith("+");
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return null;
  return `tel:${plus ? "+" : ""}${digits}`;
}

const PHONE = /(\+?\d[\d\s().-]{5,}\d)/;

/**
 * The business phone from Business info: the "Phone:" line of a contact entry first (the one
 * Waggle found on the Page), else the first phone-looking number in an entry titled like contact
 * or phone. Null when there's none.
 */
export function businessPhone(
  entries: readonly { title: string; content: string; found_kind?: string | null }[],
): string | null {
  const contact = entries.filter(
    (e) => e.found_kind === "contact" || /\b(contact|phone|call|number)\b/i.test(e.title),
  );
  for (const e of contact) {
    const line = e.content.match(/phone\s*:\s*([^\n]+)/i)?.[1];
    const hit = line?.match(PHONE)?.[1];
    if (hit && telUrl(hit)) return hit.trim();
  }
  for (const e of contact) {
    const hit = e.content.match(PHONE)?.[1];
    if (hit && telUrl(hit)) return hit.trim();
  }
  return null;
}

/** "Dec 1 – Dec 24", "Sat, Nov 28, 10:00 AM – 1:00 PM" for the Google preview card. */
export function googleDatesLabel(o: GoogleOptions): string | null {
  if (!o.startDay || !o.endDay) return null;
  const day = (d: string, weekday: boolean) => {
    const { year, month, day: dd } = dateParts(d);
    return new Date(Date.UTC(year, month - 1, dd)).toLocaleDateString("en-US", {
      ...(weekday ? { weekday: "short" } : {}),
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };
  const clock = (t: string) => {
    const { hours, minutes } = timeParts(t);
    const h = hours % 12 || 12;
    return `${h}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
  };
  if (o.kind === "event") {
    const start = `${day(o.startDay, true)}${o.startTime ? `, ${clock(o.startTime)}` : ""}`;
    if (o.endDay === o.startDay) {
      return o.endTime ? `${start} – ${clock(o.endTime)}` : start;
    }
    return `${start} – ${day(o.endDay, true)}${o.endTime ? `, ${clock(o.endTime)}` : ""}`;
  }
  return `Valid ${day(o.startDay, false)} – ${day(o.endDay, false)}`;
}

/** An offer or event Google has deleted (its end passed): Fix the text can't reach it. */
export function googleEnded(o: GoogleOptions | undefined, today: string): boolean {
  if (!o || o.kind === "update" || !o.endDay) return false;
  return o.endDay < today;
}

/**
 * The owner's Google choices made ready to save (shared by the composer and the AI assistants'
 * preview): what's wrong first; else Call now's link set to `tel:` + the business phone, and the
 * other button and redeem links given https://.
 */
export function readyGoogleOptions(
  o: GoogleOptions,
  phone: string | null,
): { ok: true; google: GoogleOptions } | { ok: false; problems: GoogleProblem[] } {
  const problems = googleProblems(o, phone);
  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    google: {
      ...o,
      ...(o.button === "CALL"
        ? { buttonUrl: telUrl(phone) ?? undefined }
        : o.button && o.buttonUrl
          ? { buttonUrl: withHttps(o.buttonUrl) }
          : { buttonUrl: undefined }),
      redeemUrl: o.redeemUrl?.trim() ? withHttps(o.redeemUrl) : undefined,
    },
  };
}
