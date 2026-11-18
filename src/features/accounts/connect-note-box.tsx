import Link from "next/link";
import { BeeCarrying } from "@/components/app/bee-setup";
import { buttonVariants } from "@/components/ui/button";
import { connectNoteCopy } from "./connect-note";

/** Waggle's honeycomb with its W: where the bee sets off from. */
function WaggleComb() {
  return (
    <svg width="40" height="44" viewBox="0 0 44 48" aria-hidden className="shrink-0">
      <path
        d="M22 2l19 11v22L22 46 3 35V13z"
        fill="var(--honey)"
        stroke="var(--ink)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <text
        x="22"
        y="30"
        textAnchor="middle"
        fontFamily="Outfit, sans-serif"
        fontWeight="700"
        fontSize="16"
        fill="#17140F"
      >
        W
      </text>
    </svg>
  );
}

/**
 * "Before you connect" (design "Every Zernio platform", approved 18 Nov): shown in place when the
 * platform's own sign-in names Zernio (or the platform bills per use). The bee carries the
 * connection from Waggle to the platform; Zernio is named in words only, never its logo.
 */
export function ConnectNoteBox({
  id,
  label,
  mark,
  actions,
}: {
  id: string;
  label: string;
  mark: React.ReactNode;
  /** Continue and Cancel from the in-place flow (18 Nov); without it, the cookie flow's links. */
  actions?: React.ReactNode;
}) {
  const copy = connectNoteCopy(id, label);
  return (
    <div
      id={`before-${id}`}
      role="region"
      aria-labelledby={`before-${id}-title`}
      className="border-honey-border bg-honey-tint flex flex-col gap-3 rounded-2xl border p-4 text-sm leading-relaxed"
    >
      <div className="flex items-center gap-1" aria-hidden>
        <WaggleComb />
        {/* The flight is 260px wide; three-quarters size on a phone. */}
        <span className="block h-[42px] w-[195px] shrink-0 sm:h-[56px] sm:w-[260px]">
          <BeeCarrying className="origin-top-left scale-75 sm:scale-100" />
        </span>
        {mark}
      </div>
      <b id={`before-${id}-title`} className="text-[15px] font-semibold">
        Waggle connects to {label} through Zernio
      </b>
      <p className="text-ink-2">
        Zernio is the secure connection service behind Waggle&apos;s links to Google, Slack and 40
        other apps. On the next page, {copy.platform} names Zernio instead of Waggle. That&apos;s
        expected.
      </p>
      {copy.youllSee && (
        <p className="border-line bg-surface rounded-xl border px-3 py-2">
          You&apos;ll see: <b>&ldquo;{copy.youllSee}&rdquo;</b>
        </p>
      )}
      <p>{copy.access}</p>
      {copy.after && <p>{copy.after}</p>}
      {copy.costs && (
        <div className="flex flex-col gap-2">
          <p>
            <b>{copy.platform} charges for each use.</b> These are {copy.platform}&apos;s own
            prices; Waggle adds them to your invoice at cost, with no markup, in the same billing
            cycle.
          </p>
          <dl className="border-line bg-surface grid max-w-[360px] grid-cols-[1fr_auto] gap-x-6 gap-y-1 rounded-xl border px-3 py-2 tabular-nums">
            {copy.costs.map((c) => (
              <div key={c.label} className="contents">
                <dt>{c.label}</dt>
                <dd>{c.price}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {actions ?? (
        <div className="flex flex-wrap items-center gap-3">
          <a href="/api/connect/continue" className={buttonVariants({ variant: "primary" })}>
            Continue to {copy.platform}
          </a>
          <Link href="/settings/accounts" className={buttonVariants({ variant: "secondary" })}>
            Not now
          </Link>
        </div>
      )}
      <details className="text-ink-2 text-[13px]">
        <summary className="w-fit cursor-pointer">Powered by Zernio · Why Zernio?</summary>
        <p className="mt-2 max-w-[640px]">
          Waggle connects to 40+ apps through Zernio, a connection service that holds the approvals
          from Google, Meta, Slack and others. Some sign-in pages show Zernio&apos;s name instead of
          Waggle&apos;s. It&apos;s the same secure connection: you choose what to allow, and you can
          remove it any time in Settings → Accounts or in that app&apos;s own settings.
        </p>
      </details>
    </div>
  );
}
