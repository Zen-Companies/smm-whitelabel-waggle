"use client";

import { AtSign, MessagesSquare, X, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PlanBees, RestingBee } from "@/components/app/bee-plan";
import { Button } from "@/components/ui/button";
import type { CheckoutSuccess } from "./popup-actions";
import {
  NUDGE_EVERY_DAYS,
  nudgeDue,
  popupFor,
  rememberClosed,
  STORAGE,
  type Popup,
} from "./banners";
import { recordPlanNotice } from "./notice-actions";
import { UpgradeDialog, WelcomeDialog, type OfferOrg } from "./offer-dialogs";
import { dailyAmount, TRIAL } from "./plans";
import { confirmCheckout, popupFacts } from "./popup-actions";
import { NO_FACTS, popupContent, popupVersion, type PopupFacts } from "./popup-copy";
import { waitingLine, type ReplyPain } from "./reply-pain";
import type { OfferReason } from "./upgrade";
import { upgradeOffer } from "./upgrade-offer";
import { carryOnFor, UpgradePopup } from "./upgrade-popup";
import { welcomeFor } from "./welcome";

/** The pop-up's own parameters, dropped from the address when it closes. */
const POPUP_PARAMS = [
  "upgrade",
  "welcome",
  "platform",
  "platforms",
  "topic",
  "checkout",
  "session_id",
];
/** Dropped from the page Checkout comes back to (choosePlan sets `upgrade` again). */
const RETURN_DROP = ["upgrade", "welcome", "checkout", "session_id"];

// The plan banner on top of every dashboard page and the plan pop-ups (Walter's flow, 20 Nov).
// Pop-ups open from the URL: `?upgrade=<reason>` (any page but Your plan) and `?welcome=1`
// (once per organization in this browser); closing drops the parameter. Out of replies opens
// once per browser session. Browser storage is only a convenience (read in try/catch): a private
// window just shows things again.

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function write(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch {
    // Blocked storage: it just shows again next time.
  }
}

export interface OutOfReplies {
  /** "December 1". */
  resetsOn: string;
  /** Stable key for this month's limit (once per session per month). */
  resetsKey: string;
  pain: ReplyPain;
}

/** This month's AI replies, for the replies pop-up (C). */
export interface ReplyUsage {
  used: number;
  allowance: number;
  /** "Dec 1". */
  resetsOn: string;
  reached: boolean;
}

export function BillingPopups({
  org,
  banner,
  out,
  usage = null,
  tenantId = null,
  needsYou = [],
  connect,
  showBanner = true,
}: {
  org: OfferOrg;
  banner: "out" | "nudge" | null;
  out: OutOfReplies | null;
  usage?: ReplyUsage | null;
  /** The open brand, for the pop-up's own numbers (none in setup: the organization's first). */
  tenantId?: string | null;
  /** The Inbox's "need you" statuses. */
  needsYou?: readonly string[];
  /** Connect an account: after paying, "Connect TikTok" carries on (accounts' server action). */
  connect?: (formData: FormData) => Promise<void>;
  /** Setup pages: pop-ups only, no banner. */
  showBanner?: boolean;
}) {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  // Storage reads happen after the page is on screen (server and first render agree).
  const [stored, setStored] = useState<{ welcomeSeen: boolean; outDue: boolean; nudge: boolean }>({
    welcomeSeen: true,
    outDue: false,
    nudge: false,
  });
  const [local, setLocal] = useState<Popup>(null);
  const [closed, setClosed] = useState<string | null>(null);
  useEffect(() => {
    const outKey = out ? STORAGE.outShown(org.orgId, out.resetsKey) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage once
    setStored({
      welcomeSeen: read(() => localStorage, STORAGE.welcomeSeen(org.orgId)) === "1",
      outDue: banner === "out" && !!outKey && !read(() => sessionStorage, outKey),
      nudge:
        banner === "nudge" &&
        nudgeDue(
          read(() => localStorage, STORAGE.nudgeHiddenAt),
          Date.now(),
        ),
    });
  }, [org.orgId, banner, out]);

  // Stripe's return from the pop-up's checkout. Decided before the plan: the webhook may have
  // moved the organization off Free already, and the pop-up still shows how it went.
  const checkout = params.get("checkout");
  const sessionId = params.get("session_id");
  const paidReturn = checkout === "done" && !!sessionId;
  const fromUrl = popupFor({
    path,
    upgrade: params.get("upgrade"),
    welcome: params.get("welcome"),
    welcomeSeen: stored.welcomeSeen,
    outDue: stored.outDue,
    onPlanToo: org.current === "free" || paidReturn,
  });
  const urlKey = `${path}?${params.toString()}`;
  // Forget a closed pop-up once the address moves on (closing drops its parameters), so the next
  // link to it (the promotion bar, an upgrade link) opens it again.
  const kept = rememberClosed(closed, urlKey);
  if (kept !== closed) setClosed(kept);
  const popup = local ?? (kept === null ? fromUrl : null);

  // The out pop-up counts as shown once it opens.
  useEffect(() => {
    if (popup?.kind === "out" && out) {
      write(() => sessionStorage, STORAGE.outShown(org.orgId, out.resetsKey), "1");
    }
  }, [popup?.kind, out, org.orgId]);

  const close = () => {
    if (local) {
      setLocal(null);
      return;
    }
    setClosed(urlKey);
    if (popup?.kind === "welcome") {
      write(() => localStorage, STORAGE.welcomeSeen(org.orgId), "1");
      void recordPlanNotice({ orgId: org.orgId, what: "welcome_closed" }).catch(() => undefined);
    } else if (popup?.kind === "upgrade") {
      void recordPlanNotice({
        orgId: org.orgId,
        what: "offer_closed",
        reason: popup.reason,
      }).catch(() => undefined);
    } else if (popup?.kind === "out") {
      setStored((s) => ({ ...s, outDue: false }));
      void recordPlanNotice({ orgId: org.orgId, what: "out_closed" }).catch(() => undefined);
    }
    // Drop the pop-up's parameters so a refresh doesn't open it again.
    if (POPUP_PARAMS.some((k) => params.has(k))) {
      const next = new URLSearchParams(params.toString());
      for (const k of POPUP_PARAMS) next.delete(k);
      const q = next.toString();
      router.replace(q ? `${path}?${q}` : path, { scroll: false });
    }
  };
  /** After paying: close, and the page reads the new plan. */
  const done = () => {
    close();
    router.refresh();
  };

  const open = (reason: OfferReason) => setLocal({ kind: "upgrade", reason });

  // Free: the new pop-up (one layout, six versions), with the brand's own numbers once it opens.
  const free = org.current === "free";
  const [facts, setFacts] = useState<{ key: string; facts: Omit<PopupFacts, "usage"> } | null>(
    null,
  );
  const factsKey = free && popup ? `${org.orgId}:${tenantId ?? ""}` : null;
  const needsYouKey = needsYou.join(",");
  useEffect(() => {
    if (!factsKey || facts?.key === factsKey) return;
    let live = true;
    void popupFacts({
      orgId: org.orgId,
      tenantId,
      needsYou: needsYouKey ? needsYouKey.split(",") : [],
    })
      .then((f) => {
        if (live && f) setFacts({ key: factsKey, facts: f });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [factsKey, facts?.key, org.orgId, tenantId, needsYouKey]);

  // Stripe's return: asked once per session id.
  const [confirmed, setConfirmed] = useState<{
    id: string;
    result: CheckoutSuccess | null;
  } | null>(null);
  useEffect(() => {
    if (checkout !== "done" || !sessionId || confirmed?.id === sessionId) return;
    let live = true;
    void confirmCheckout({ orgId: org.orgId, sessionId })
      .catch(() => null)
      .then((result) => {
        if (live) setConfirmed({ id: sessionId, result });
      });
    return () => {
      live = false;
    };
  }, [checkout, sessionId, confirmed?.id, org.orgId]);

  const back = (() => {
    const next = new URLSearchParams(params.toString());
    for (const k of RETURN_DROP) next.delete(k);
    const q = next.toString();
    return q ? `${path}?${q}` : path;
  })();

  // Back from the pop-up's checkout: its success state, whatever the plan reads now.
  const returning = !local && popup?.kind === "upgrade" && paidReturn;
  const freePopup = (() => {
    if (!popup || (!free && !returning)) return null;
    const reason: OfferReason | "welcome" =
      popup.kind === "upgrade" ? popup.reason : popup.kind === "out" ? "out" : "welcome";
    const version = popupVersion(
      reason,
      {
        platform: params.get("platform"),
        platforms: params.get("platforms"),
        topic: params.get("topic"),
      },
      usage?.reached ? "out" : "low",
    );
    const known: PopupFacts = {
      ...NO_FACTS,
      ...(facts?.facts ?? {}),
      pain: facts?.facts.pain ?? out?.pain ?? null,
      usage: usage
        ? { used: usage.used, allowance: usage.allowance, resetsOn: usage.resetsOn }
        : null,
    };
    const content = popupContent({
      version,
      plans: org.plans,
      trial: org.trial,
      trialDays: org.trialDays,
      facts: known,
      now: new Date(),
    });
    const returned =
      !local && popup.kind === "upgrade" && (checkout === "done" || checkout === "cancelled");
    return (
      <UpgradePopup
        content={content}
        org={org}
        // The welcome comes back as Try Solo (same offer, same success line).
        reason={reason === "welcome" ? "nudge" : reason}
        back={back}
        checkout={returned ? (checkout as "done" | "cancelled") : null}
        confirmed={
          checkout === "done" && sessionId
            ? confirmed?.id === sessionId
              ? confirmed.result
              : "checking"
            : null
        }
        carryOn={carryOnFor(version, connect, back)}
        onClose={close}
        onDone={done}
      />
    );
  })();
  const hideNudge = () => {
    write(() => localStorage, STORAGE.nudgeHiddenAt, String(Date.now()));
    setStored((s) => ({ ...s, nudge: false }));
    void recordPlanNotice({ orgId: org.orgId, what: "nudge_hidden" }).catch(() => undefined);
  };

  return (
    <>
      {showBanner && banner === "out" && out && (
        <OutBanner org={org} out={out} onOpen={() => open("out")} />
      )}
      {showBanner && stored.nudge && (
        <SoloNudge org={org} onOpen={() => open("nudge")} onHide={hideNudge} />
      )}
      {freePopup}
      {!free && !returning && popup?.kind === "upgrade" && (
        <UpgradeDialog
          reason={popup.reason}
          org={org}
          onClose={close}
          resetsOn={out?.resetsOn}
          pain={popup.reason === "out" ? out?.pain : undefined}
        />
      )}
      {!free && popup?.kind === "out" && out && (
        <UpgradeDialog
          reason="out"
          org={org}
          onClose={close}
          resetsOn={out.resetsOn}
          pain={out.pain}
        />
      )}
      {!free && popup?.kind === "welcome" && (
        <WelcomeDialog
          content={welcomeFor(org.current, org.plans, {
            trial: org.trial,
            trialDays: org.trialDays,
          })}
          org={org}
          onClose={close}
        />
      )}
    </>
  );
}

/** Out of replies, on every page until replies come back (decision 9): the honest line. */
function OutBanner({ org, out, onOpen }: { org: OfferOrg; out: OutOfReplies; onOpen: () => void }) {
  const offer = upgradeOffer(org.current, "out", org.plans, {
    trial: org.trial,
    trialDays: org.trialDays,
    resetsOn: out.resetsOn,
  });
  const label =
    org.current === "free"
      ? (offer.cta ?? "See your plan")
      : offer.extra === "topUp"
        ? "Get more replies"
        : "See your plan";
  return (
    <section
      role="status"
      className="border-honey bg-honey-tint flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3"
    >
      <RestingBee />
      <span className="min-w-[200px] flex-1 text-sm">
        <b>You&apos;re out of AI replies.</b>{" "}
        {waitingLine(out.pain.waiting) ? `${waitingLine(out.pain.waiting)} ` : ""}
        Waggle has stopped writing replies until {out.resetsOn}. New messages still arrive in your
        Inbox, and you can answer them yourself.
      </span>
      {org.isOwner ? (
        <Button type="button" variant="primary" onClick={onOpen}>
          {label}
        </Button>
      ) : (
        <Link href="/inbox" className="action-link text-sm">
          Go to the Inbox
        </Link>
      )}
    </section>
  );
}

/** "Try Solo free" (Free only): dark, a honey glow, what Solo adds and its price a day. */
function SoloNudge({
  org,
  onOpen,
  onHide,
}: {
  org: OfferOrg;
  onOpen: () => void;
  onHide: () => void;
}) {
  const solo = org.plans.solo;
  const perks: { icon: LucideIcon; label: string }[] = [
    ...(solo.features.autoReply ? [{ icon: Zap, label: "Auto-reply" }] : []),
    { icon: AtSign, label: `${solo.accounts} accounts` },
    { icon: MessagesSquare, label: `${solo.replies.toLocaleString("en-US")} AI replies a month` },
  ];
  return (
    <section
      aria-label={`Try ${solo.name}`}
      className="bg-ink text-page relative overflow-hidden rounded-2xl px-4 py-3.5 shadow-[0_8px_24px_rgba(246,178,27,0.22)] sm:px-5"
    >
      <span
        aria-hidden
        className="bg-honey/30 pointer-events-none absolute -top-16 -left-10 size-44 rounded-full blur-3xl"
      />
      <span
        aria-hidden
        className="bg-honey/20 pointer-events-none absolute -right-12 -bottom-20 size-48 rounded-full blur-3xl"
      />
      <div className="relative flex flex-wrap items-center gap-x-5 gap-y-3 pr-8 sm:pr-10">
        <span className="bg-honey-tint grid size-12 shrink-0 place-items-center overflow-hidden rounded-full">
          {/* The bee is drawn in a 70px box: kept, scaled to fit the circle. */}
          <PlanBees plan="solo" className="-m-[11px] scale-[0.68]" />
        </span>
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <p className="font-display m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[17px] leading-tight font-semibold">
            Let Waggle answer on its own
            {org.trial && (
              <span className="bg-honey text-ink rounded-full px-2 py-0.5 font-sans text-[11px] font-bold tracking-wide uppercase">
                {(org.trialDays ?? TRIAL.days) === TRIAL.days
                  ? "First month free"
                  : `${org.trialDays} days free`}
              </span>
            )}
          </p>
          <ul className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0 text-[13px] opacity-80">
            {perks.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1.5">
                <Icon className="text-honey size-3.5" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-xs font-medium opacity-75">about</span>
            <span className="font-display text-honey text-[24px] leading-none font-bold">
              {dailyAmount(solo.monthlyUsd)}
            </span>
            <span className="text-xs font-semibold">a day</span>
          </span>
          <Button type="button" variant="primary" onClick={onOpen}>
            {org.trial ? `Try ${solo.name} free` : `See ${solo.name}`}
          </Button>
        </div>
      </div>
      <button
        type="button"
        aria-label={`Hide for ${NUDGE_EVERY_DAYS} days`}
        title={`Hide for ${NUDGE_EVERY_DAYS} days`}
        onClick={onHide}
        className="hover:bg-page/10 absolute top-2 right-2 grid size-8 place-items-center rounded-full opacity-70 transition hover:opacity-100"
      >
        <X className="size-4" aria-hidden />
      </button>
    </section>
  );
}
