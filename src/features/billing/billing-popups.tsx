"use client";

import { AtSign, MessagesSquare, X, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PlanBees, RestingBee } from "@/components/app/bee-plan";
import { Button } from "@/components/ui/button";
import { NUDGE_EVERY_DAYS, nudgeDue, popupFor, STORAGE, type Popup } from "./banners";
import { recordPlanNotice } from "./notice-actions";
import { UpgradeDialog, WelcomeDialog, type OfferOrg } from "./offer-dialogs";
import { dailyAmount, TRIAL } from "./plans";
import { waitingLine, type ReplyPain } from "./reply-pain";
import type { OfferReason } from "./upgrade";
import { upgradeOffer } from "./upgrade-offer";
import { welcomeFor } from "./welcome";

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

export function BillingPopups({
  org,
  banner,
  out,
  showBanner = true,
}: {
  org: OfferOrg;
  banner: "out" | "nudge" | null;
  out: OutOfReplies | null;
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

  const fromUrl = popupFor({
    path,
    upgrade: params.get("upgrade"),
    welcome: params.get("welcome"),
    welcomeSeen: stored.welcomeSeen,
    outDue: stored.outDue,
  });
  const urlKey = `${path}?${params.toString()}`;
  const popup = local ?? (closed === urlKey ? null : fromUrl);

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
    // Drop ?upgrade= and ?welcome= so a refresh doesn't open it again.
    if (params.has("upgrade") || params.has("welcome")) {
      const next = new URLSearchParams(params.toString());
      next.delete("upgrade");
      next.delete("welcome");
      const q = next.toString();
      router.replace(q ? `${path}?${q}` : path, { scroll: false });
    }
  };

  const open = (reason: OfferReason) => setLocal({ kind: "upgrade", reason });
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
      {popup?.kind === "upgrade" && (
        <UpgradeDialog
          reason={popup.reason}
          org={org}
          onClose={close}
          resetsOn={out?.resetsOn}
          pain={popup.reason === "out" ? out?.pain : undefined}
        />
      )}
      {popup?.kind === "out" && out && (
        <UpgradeDialog
          reason="out"
          org={org}
          onClose={close}
          resetsOn={out.resetsOn}
          pain={out.pain}
        />
      )}
      {popup?.kind === "welcome" && (
        <WelcomeDialog
          content={welcomeFor(org.current, org.plans, { trial: org.trial })}
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
        <span className="bg-honey-tint grid size-12 shrink-0 place-items-center rounded-full">
          {/* The bee is drawn in a 70px box: kept, scaled to fit the circle. */}
          <PlanBees plan="solo" className="-m-[11px] scale-[0.68]" />
        </span>
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <p className="font-display m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[17px] leading-tight font-semibold">
            Let Waggle answer on its own
            {org.trial && (
              <span className="bg-honey text-ink rounded-full px-2 py-0.5 font-sans text-[11px] font-bold tracking-wide uppercase">
                {TRIAL.days} days free
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
