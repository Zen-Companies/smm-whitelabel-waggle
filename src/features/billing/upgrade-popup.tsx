"use client";

import { X } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useActionState,
  useState,
  useSyncExternalStore,
} from "react";
import { BeeBody } from "@/components/app/bee";
import { PlatformMark } from "@/components/app/platform-mark";
import { cn } from "cn";
import { CheckoutSuccess } from "./checkout-success";
import { choosePlan, type PlanActionState } from "./plan-actions";
import type { CheckoutSuccess as Confirmed } from "./popup-actions";
import type { PopupContent, PopupVersion, Seg, StripBox } from "./popup-copy";
import { browserWallet, type Wallet } from "./wallet";
import { AcceptedMarks, WALLET_LABEL, WalletMark } from "./wallet-mark";

// The device never changes while the page is open, so nothing to subscribe to.
const noSubscribe = () => () => {};
const serverWallet = (): Wallet => "none";

// The upgrade pop-up (board "Replica update … upgrade pop-ups", approved 23 Nov): one layout for
// every version. A bottom sheet on a phone (grab handle), a centred box with × on a computer. Both
// pay buttons go to Stripe Checkout as today (paying inside the pop-up comes later); Checkout
// comes back to this page with the pop-up open again, saying how it went. Feedback in place, no
// toasts (design.md §4). Teammates see who can upgrade instead of the pay buttons.

/** The frame every plan pop-up uses. Esc, × and the backdrop close it when `closable`. */
export function Sheet({
  labelledBy,
  onClose,
  closable = true,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  closable?: boolean;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const onEscape = useEffectEvent(() => {
    if (closable) onClose();
  });
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
      <div
        aria-hidden
        className="bg-ink/30 fixed inset-0 z-[80]"
        onClick={closable ? onClose : undefined}
      />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="bg-surface border-line text-ink fixed inset-x-0 bottom-0 z-[90] flex max-h-[92dvh] flex-col overflow-y-auto rounded-t-[24px] border px-[18px] pt-3 pb-[max(18px,env(safe-area-inset-bottom))] shadow-[0_12px_32px_rgba(23,20,15,0.14)] outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[calc(100%-32px)] sm:max-w-[400px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px] sm:p-5"
      >
        <span
          aria-hidden
          className="bg-line-strong mx-auto mb-3 h-[5px] w-10 rounded-full sm:hidden"
        />
        {closable && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="bg-subtle text-ink-2 hover:text-ink absolute top-2.5 right-3 hidden size-[30px] place-items-center rounded-full sm:grid"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
        {children}
      </div>
    </>
  );
}

const TONE: Record<StripBox["tone"], string> = {
  done: "bg-success-soft text-success border-transparent",
  now: "bg-honey-tint text-honey-text border-honey",
  open: "bg-surface text-ink-3 border-line-strong border-dashed",
};

const GLYPH_TONE: Record<StripBox["tone"], string> = {
  done: "bg-success text-surface",
  now: "bg-honey text-ink",
  open: "bg-subtle text-ink-3",
};

/**
 * The picture on top of a strip box (Walter's spec, 24 Nov: "three boxes with the real logos"):
 * the platform's own logo, the bee for Worker Bee, else a plain ✓ or +. Decorative: the box's
 * words say the same.
 */
function StripIcon({ box }: { box: StripBox }) {
  if (box.platform) return <PlatformMark platform={box.platform} size={30} />;
  if (box.bee) {
    return (
      <span
        aria-hidden
        className="bg-surface grid size-[30px] place-items-center rounded-full shadow-[inset_0_0_0_1px_rgba(23,20,15,0.10)]"
      >
        <svg width="22" height="15" viewBox="0 0 24 16">
          <BeeBody flutter={false} />
        </svg>
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-[30px] place-items-center rounded-full text-[15px] font-bold",
        GLYPH_TONE[box.tone],
      )}
    >
      {box.tone === "done" ? "✓" : "+"}
    </span>
  );
}

function Strip({ boxes }: { boxes: StripBox[] }) {
  return (
    <div className="flex gap-1.5 sm:mt-5">
      {boxes.map((b, i) => (
        <div
          key={i}
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center gap-px rounded-xl border-[1.5px] px-1.5 py-2 text-center text-[11.5px]",
            TONE[b.tone],
          )}
        >
          <span className="mb-1">
            <StripIcon box={b} />
          </span>
          <b className="text-ink w-full truncate text-[12.5px]">{b.title}</b>
          <span>{b.text}</span>
        </div>
      ))}
    </div>
  );
}

function Segs({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) =>
        s.bold ? (
          <b key={i} className="text-honey-text text-[14.5px]">
            {s.text}
          </b>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function SmallBee() {
  return (
    <svg width="17" height="12" viewBox="0 0 24 16" aria-hidden className="mt-0.5 shrink-0">
      <BeeBody flutter={false} />
    </svg>
  );
}

export interface PopupOrg {
  orgId: string;
  isOwner: boolean;
  stripeReady: boolean;
}

/** What happens after "You're on Solo": the tapped action carries on. */
export type CarryOn =
  | {
      kind: "connect";
      platform: string;
      action: (formData: FormData) => Promise<void>;
      back: string;
    }
  | { kind: "link"; href: string; label: string }
  | null;

/** Pure: the next step after paying, for a version (none: just Done). */
export function carryOnFor(
  version: PopupVersion,
  connect: ((formData: FormData) => Promise<void>) | undefined,
  back: string,
): CarryOn {
  if (version.v === "accounts" && version.platform && connect) {
    return { kind: "connect", platform: version.platform, action: connect, back };
  }
  if (version.v === "team" && version.sub === "invite") {
    return { kind: "link", href: "/settings/team", label: "Invite your team" };
  }
  if (version.v === "team" && version.sub === "brands") {
    return { kind: "link", href: "/brands/new", label: "Add your business" };
  }
  return null;
}

function PayButtons({
  content,
  org,
  reason,
  back,
  cancelled,
}: {
  content: PopupContent;
  org: PopupOrg;
  reason: string;
  back: string;
  cancelled: boolean;
}) {
  const [state, run, pending] = useActionState<PlanActionState, FormData>(choosePlan, {});
  const [via, setVia] = useState<"wallet" | "card">("card");
  // Apple Pay on Apple devices, Google Pay on Chrome/Android, no wallet button otherwise. Nothing
  // on the server, so hydration matches; the card button stays where it is below it.
  const wallet = useSyncExternalStore(noSubscribe, browserWallet, serverWallet);
  const problem =
    state.error ??
    (cancelled ? "No card was added, so nothing changed. Try again, or use another card." : null);
  return (
    <form action={run} className="flex flex-col gap-[7px]">
      <input type="hidden" name="orgId" value={org.orgId} />
      <input type="hidden" name="plan" value={content.plan} />
      <input type="hidden" name="interval" value="month" />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="reason" value={reason} />
      {wallet !== "none" && (
        <button
          type="submit"
          onClick={() => setVia("wallet")}
          disabled={pending}
          data-busy={pending || undefined}
          aria-label={WALLET_LABEL[wallet]}
          className="flex min-h-11 items-center justify-center rounded-xl bg-black px-4 text-sm font-bold text-white ring-1 ring-white/15 transition disabled:opacity-60"
        >
          {pending && via === "wallet" ? "Starting…" : <WalletMark wallet={wallet} />}
        </button>
      )}
      <button
        type="submit"
        onClick={() => setVia("card")}
        disabled={pending}
        data-busy={pending || undefined}
        className="bg-honey hover:bg-honey-hover text-ink min-h-11 rounded-xl px-4 text-sm font-bold transition disabled:opacity-60"
      >
        {pending && via === "card" ? "Starting…" : content.cardLabel}
      </button>
      {problem && !pending && (
        <span role="alert" className="text-danger text-center text-xs">
          {problem}
        </span>
      )}
    </form>
  );
}

/** One version of the upgrade pop-up, with its states. */
export function UpgradePopup({
  content,
  org,
  reason,
  back,
  checkout,
  confirmed,
  carryOn,
  onClose,
  onDone,
}: {
  content: PopupContent;
  org: PopupOrg;
  /** `?upgrade=` that opened it, so Checkout comes back to it. */
  reason: string;
  /** The page it's on, with its own query. */
  back: string;
  /** Stripe's return: done or cancelled. */
  checkout: "done" | "cancelled" | null;
  /** After done: Stripe confirmed the checkout (with the ads tag), or not (null), or still asking. */
  confirmed: Confirmed | null | "checking";
  carryOn: CarryOn;
  onClose: () => void;
  /** After success: close and refresh the page for the new plan. */
  onDone: () => void;
}) {
  if (checkout === "done") {
    return (
      <Sheet labelledBy="upgrade-title" onClose={onDone}>
        <div className="flex flex-col gap-3 sm:mt-4">
          {confirmed === "checking" ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <svg width="36" height="24" viewBox="0 0 24 16" aria-hidden className="bee-bob">
                <BeeBody />
              </svg>
              <p id="upgrade-title" className="text-ink-2 m-0 text-center text-sm" role="status">
                Checking with Stripe…
              </p>
            </div>
          ) : confirmed ? (
            // The success moment (approved 24 Nov): one primary button, then Go to my Inbox.
            <CheckoutSuccess
              content={content}
              confirmed={confirmed}
              carryOn={carryOn}
              onDone={onDone}
            />
          ) : (
            <h2 id="upgrade-title" className="text-ink-2 m-0 text-center text-sm font-normal">
              We couldn’t confirm the payment yet. If you added a card, your plan updates in a
              minute.
            </h2>
          )}
          {(!confirmed || confirmed === "checking") && (
            <button
              type="button"
              onClick={onDone}
              className="text-ink-2 hover:text-ink min-h-10 self-center text-[13.5px] font-semibold underline"
            >
              Done
            </button>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet labelledBy="upgrade-title" onClose={onClose} closable={content.closable}>
      <div className="flex flex-col gap-[11px]">
        <Strip boxes={content.strip} />
        <div className="flex flex-col gap-[3px]">
          <h2 id="upgrade-title" className="font-display m-0 text-[21px] leading-[1.2] font-bold">
            {content.headline}
          </h2>
          <span className="text-ink-2 text-[13px]">{content.sub}</span>
        </div>
        {content.honey && (
          <p className="border-honey-border bg-honey-tint m-0 rounded-[14px] border px-3 py-[9px] text-[13px]">
            <Segs segs={content.honey} />
          </p>
        )}
        <ul className="text-ink-2 m-0 flex list-none flex-col gap-1.5 p-0 text-[12.5px]">
          {content.ticks.map((t) => (
            <li key={t.bold} className="flex items-start gap-1.5">
              {t.bee ? (
                <SmallBee />
              ) : (
                <span
                  aria-hidden
                  className="text-success w-[17px] shrink-0 text-center font-extrabold"
                >
                  ✓
                </span>
              )}
              <span>
                <b className="text-ink">{t.bold}</b>
                {t.rest ? ` · ${t.rest}` : ""}
              </span>
            </li>
          ))}
        </ul>
        {!org.isOwner ? (
          <p className="text-ink-2 m-0 text-center text-[13px]">
            Ask your organization’s Owner to upgrade.
          </p>
        ) : !org.stripeReady ? (
          <p className="meta m-0 text-center">Paid plans aren’t set up on this server yet.</p>
        ) : (
          <>
            <PayButtons
              content={content}
              org={org}
              reason={reason}
              back={back}
              cancelled={checkout === "cancelled"}
            />
            <AcceptedMarks />
            <p className="text-ink-3 m-0 text-center text-xs">{content.note}</p>
          </>
        )}
        {content.keep.kind === "inbox" ? (
          <Link
            href="/inbox"
            onClick={onClose}
            className="text-ink-2 hover:text-ink inline-flex min-h-10 items-center self-center text-[13.5px] font-semibold underline"
          >
            {content.keep.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="text-ink-2 hover:text-ink min-h-10 self-center text-[13.5px] font-semibold underline"
          >
            {content.keep.label}
          </button>
        )}
      </div>
    </Sheet>
  );
}
