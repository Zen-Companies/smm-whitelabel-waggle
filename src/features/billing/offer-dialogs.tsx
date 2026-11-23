"use client";

import { BeeDance } from "@/components/app/bee-setup";
import {
  AtSign,
  Building2,
  CalendarCheck,
  Flame,
  MessagesSquare,
  RefreshCw,
  UserPlus,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef } from "react";
import { PlanBees } from "@/components/app/bee-plan";
import { Button, buttonVariants } from "@/components/ui/button";
import { ROLE_HINT, ROLE_LABEL } from "@/features/orgs/client";
import { DayBanner } from "./day-price";
import { buyTopUpNow, changeExtraAccounts, choosePlan } from "./plan-actions";
import { PlanButton, TopUpButton } from "./plan-forms";
import { BUSINESS_CALL_URL, EXTRAS, type Plan, type PlanId } from "./plans";
import { painTiles, type ReplyPain } from "./reply-pain";
import type { OfferReason } from "./upgrade";
import { upgradeOffer, type UpgradeOffer } from "./upgrade-offer";
import type { PerkKey, WelcomeContent, WelcomePerk } from "./welcome";

// The plan pop-ups (Walter's flow, 20 Nov): the upgrade offer by situation and the welcome after
// setup. Friendly, with the bee; Esc, the backdrop or the quiet button closes them. Feedback in
// place, no toasts (design.md §5). Non-owners see no billing buttons, only who can upgrade.

/** What the pop-ups need about the organization (loaded on the server, BillingHost). */
export interface OfferOrg {
  orgId: string;
  isOwner: boolean;
  /** Can invite people (team.manage). */
  canInvite: boolean;
  current: PlanId;
  plans: Record<PlanId, Plan>;
  /** Its first paid plan starts with 7 days free. */
  trial: boolean;
  /** Stripe is set up on this server. */
  stripeReady: boolean;
  /** The interval a switch keeps. */
  interval: "month" | "year";
}

const TEAM_HREF = "/settings/team";

/** The pop-up frame: a sheet from the bottom on a phone, centered on a desktop. */
function Modal({
  labelledBy,
  onClose,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const onEscape = useEffectEvent(onClose);
  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <div aria-hidden className="bg-ink/30 fixed inset-0 z-[80]" onClick={onClose} />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="bg-surface border-honey-border text-ink fixed inset-x-0 bottom-0 z-[90] flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[18px] border shadow-[0_12px_32px_rgba(23,20,15,0.14)] outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[calc(100%-32px)] sm:max-w-[480px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[18px]"
      >
        {children}
      </div>
    </>
  );
}

function Header({
  plan,
  eyebrow,
  title,
  id,
}: {
  plan: PlanId;
  eyebrow: string;
  title: string;
  id: string;
}) {
  return (
    <div className="hexbg bg-honey-tint flex items-center gap-4 px-6 py-5">
      <PlanBees plan={plan} />
      <span className="flex min-w-0 flex-col">
        {eyebrow && <span className="meta">{eyebrow}</span>}
        <h2 id={id} className="font-display text-[22px] leading-tight font-semibold">
          {title}
        </h2>
      </span>
    </div>
  );
}

/** The offer's buttons: the extra (paid plans), the plan, or who to ask. */
function OfferActions({
  offer,
  org,
  closeLabel,
  onClose,
  answerMyself = false,
}: {
  offer: UpgradeOffer;
  org: OfferOrg;
  closeLabel: string;
  onClose: () => void;
  /** Out of replies: the quiet way out is answering by hand in the Inbox. */
  answerMyself?: boolean;
}) {
  const close = answerMyself ? (
    <Link
      href="/inbox"
      onClick={onClose}
      className="action-link inline-flex min-h-10 items-center px-2 text-sm"
    >
      Answer them myself
    </Link>
  ) : (
    <Button type="button" variant="quiet" onClick={onClose}>
      {closeLabel}
    </Button>
  );
  if (!org.isOwner) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-ink-2 min-w-[200px] flex-1 text-sm">
          Ask your organization&apos;s Owner to{" "}
          {offer.extra && !offer.next ? "add more" : "upgrade"}.
        </span>
        {close}
      </div>
    );
  }
  const payable = org.stripeReady;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {payable && offer.extra === "account" && (
        <PlanButton
          action={changeExtraAccounts}
          fields={{ orgId: org.orgId, delta: "1" }}
          label={`Add an account · $${EXTRAS.accountUsd} a month`}
          pendingLabel="Adding…"
          honey
          className="items-start"
        />
      )}
      {payable && offer.extra === "topUp" && (
        <TopUpButton
          action={buyTopUpNow}
          orgId={org.orgId}
          card={null}
          label={`+${EXTRAS.topUp.replies} replies for $${EXTRAS.topUp.usd}`}
          usd={EXTRAS.topUp.usd}
          replies={EXTRAS.topUp.replies}
          honey
        />
      )}
      {payable && offer.next && offer.via !== "call" && (
        <PlanButton
          action={choosePlan}
          fields={{
            orgId: org.orgId,
            plan: offer.next,
            interval: org.current === "free" ? "month" : org.interval,
          }}
          label={offer.cta ?? ""}
          pendingLabel={offer.via === "switch" ? "Switching…" : "Starting…"}
          honey={!offer.extra}
          className="items-start"
        />
      )}
      {offer.via === "call" && (
        <a
          href={BUSINESS_CALL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: offer.extra ? "secondary" : "primary" })}
        >
          {offer.cta}
        </a>
      )}
      {!payable && offer.via !== "call" && (
        <span className="meta self-center">Paid plans aren&apos;t set up on this server yet.</span>
      )}
      {close}
    </div>
  );
}

/** Out of replies: how often customers write and how many wait now. Plain ink (decision 9). */
function PainTiles({ pain }: { pain: ReplyPain }) {
  const tiles = painTiles(pain);
  if (tiles.length === 0) return null;
  return (
    <div className={tiles.length > 1 ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
      {tiles.map((t) => (
        <div
          key={t.text}
          className="border-line bg-page flex flex-col gap-1 rounded-xl border px-3.5 py-3"
        >
          <b className="font-display text-ink text-[28px] leading-none font-bold tabular-nums">
            {t.n}
          </b>
          <span className="text-ink-2 text-sm leading-snug">{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/** The upgrade offer for a situation (upgrade-offer.ts), over the page. */
export function UpgradeDialog({
  reason,
  org,
  onClose,
  resetsOn,
  pain,
}: {
  reason: OfferReason;
  org: OfferOrg;
  onClose: () => void;
  resetsOn?: string;
  pain?: ReplyPain;
}) {
  const offer = upgradeOffer(org.current, reason, org.plans, { trial: org.trial, resetsOn });
  const header = offer.next ?? org.current;
  return (
    <Modal labelledBy="upgrade-title" onClose={onClose}>
      <Header
        plan={header}
        eyebrow={org.plans[header].name}
        title={offer.title}
        id="upgrade-title"
      />
      <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5">
        {reason === "out" && pain && <PainTiles pain={pain} />}
        <p className="text-ink-2 m-0 text-[15px]">{offer.body}</p>
        {offer.line && <p className="meta m-0">{offer.line}</p>}
        {offer.day && org.isOwner && <DayBanner amount={offer.day.amount} of={offer.day.of} />}
        <OfferActions
          offer={offer}
          org={org}
          closeLabel="Not now"
          onClose={onClose}
          answerMyself={reason === "out"}
        />
        {offer.footnote && org.isOwner && <p className="meta m-0">{offer.footnote}</p>}
      </div>
    </Modal>
  );
}

const PERK_ICON: Record<PerkKey, LucideIcon> = {
  autoReply: Zap,
  leads: Flame,
  followUps: RefreshCw,
  team: Users,
  room: MessagesSquare,
  accounts: AtSign,
  clients: Building2,
  setup: CalendarCheck,
};

function HeroPerk({ perk }: { perk: WelcomePerk }) {
  const Icon = PERK_ICON[perk.key];
  return (
    <div className="border-honey-border bg-honey-tint flex items-start gap-3 rounded-xl border px-4 py-3.5">
      <span className="bg-honey text-ink grid size-9 shrink-0 place-items-center rounded-full">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[16px] font-semibold">{perk.title}</span>
        <span className="text-ink-2 text-sm">{perk.body}</span>
      </span>
    </div>
  );
}

function PerkRow({ perk }: { perk: WelcomePerk }) {
  const Icon = PERK_ICON[perk.key];
  return (
    <li className="flex items-start gap-3 px-1">
      <span className="bg-subtle text-ink-2 mt-0.5 grid size-7 shrink-0 place-items-center rounded-full">
        <Icon className="size-[15px]" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{perk.title}</span>
        <span className="text-ink-2 text-sm">{perk.body}</span>
      </span>
    </li>
  );
}

/** Business: bring the team in, with who can do what in the team page's words. */
function TeamRoles() {
  return (
    <section className="border-line flex flex-col gap-2.5 rounded-xl border px-4 py-3.5">
      <h3 className="m-0 flex items-center gap-2 text-[15px] font-semibold">
        <UserPlus className="size-4" aria-hidden />
        Bring your team in
      </h3>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {(["admin", "member", "viewer"] as const).map((r) => (
          <li key={r} className="text-ink-2 text-sm">
            <span className="text-ink font-semibold">{ROLE_LABEL[r]}:</span> {ROLE_HINT[r]}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The welcome pop-up after setup (welcome.ts), once, over the Inbox. */
export function WelcomeDialog({
  content,
  org,
  onClose,
}: {
  content: WelcomeContent;
  org: OfferOrg;
  onClose: () => void;
}) {
  const { offer } = content;
  const header = offer?.next ?? org.current;
  const teamMain = content.team === "main";
  const [hero, ...others] = content.perks;
  return (
    <Modal labelledBy="welcome-title" onClose={onClose}>
      <Header plan={header} eyebrow={content.eyebrow} title={content.title} id="welcome-title" />
      <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5">
        {/* Setup's end (approved 21 Nov): the bee dances once as the Inbox opens. */}
        <BeeDance times={1} scale={0.4} className="self-center" />
        <p className="text-ink-2 m-0 text-[15px]">{content.pitch}</p>
        {hero && <HeroPerk perk={hero} />}
        {others.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {others.map((p) => (
              <PerkRow key={p.title} perk={p} />
            ))}
          </ul>
        )}
        {teamMain && <TeamRoles />}
        {content.team === "note" && (
          <p className="text-ink-2 m-0 flex items-start gap-2 text-sm">
            <UserPlus className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Your plan includes your team.{" "}
              {org.canInvite ? (
                <Link href={TEAM_HREF} onClick={onClose} className="action-link">
                  Invite them
                </Link>
              ) : (
                "Ask your Owner to invite them"
              )}{" "}
              so they can approve replies with you.
            </span>
          </p>
        )}
        {content.now && <p className="meta m-0">{content.now}</p>}
      </div>
      <div className="border-line flex flex-col gap-3 border-t px-6 py-4 max-sm:pb-[max(16px,env(safe-area-inset-bottom))]">
        {offer?.day && org.isOwner && <DayBanner amount={offer.day.amount} of={offer.day.of} />}
        {teamMain ? (
          <div className="flex flex-wrap items-center gap-2">
            {org.canInvite ? (
              <Link
                href={TEAM_HREF}
                onClick={onClose}
                className={buttonVariants({ variant: "primary" })}
              >
                <UserPlus className="size-4" aria-hidden />
                Invite your team
              </Link>
            ) : (
              <span className="text-ink-2 min-w-[200px] flex-1 text-sm">
                Ask your Owner or an Admin to invite people.
              </span>
            )}
            <Button type="button" variant="quiet" onClick={onClose}>
              Go to my inbox
            </Button>
          </div>
        ) : offer ? (
          <OfferActions offer={offer} org={org} closeLabel="Go to my inbox" onClose={onClose} />
        ) : (
          <Button type="button" variant="quiet" onClick={onClose}>
            Go to my inbox
          </Button>
        )}
        {offer?.footnote && org.isOwner && <p className="meta m-0">{offer.footnote}</p>}
      </div>
    </Modal>
  );
}
