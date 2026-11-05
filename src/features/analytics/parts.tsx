import { CircleAlert, ImageIcon } from "lucide-react";
import { IllustratedEmpty } from "@/components/app/illustrated-empty";
import { platformName } from "@/components/app/time";
import { Button } from "@/components/ui/button";
import { connectAccount } from "@/features/accounts";
import { cn } from "cn";
import type { Delta } from "./format";
import type { AnalyticsAccount } from "./data";

/** A total with its change (design: Analytics tiles). Changes carry ▲/▼ and words, never color alone. */
export function Tile({
  label,
  value,
  delta,
  note,
  compare,
}: {
  label: string;
  /** "…" while a number isn't in yet, "–" when there is nothing to count. */
  value: string;
  delta?: Delta | null;
  /** Gray line under the value when there's no change to show (or a reason for "…"). */
  note?: string;
  /** " vs the 30 days before", on the first tile only. */
  compare?: string;
}) {
  return (
    <div className="border-line flex min-w-0 flex-col gap-1 rounded-xl border px-4 py-3.5">
      <span className="meta">{label}</span>
      <b className="text-[26px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">
        {value}
      </b>
      {delta ? (
        <span
          className={cn(
            "text-[13px] font-medium",
            delta.direction === "up" && "text-success",
            delta.direction === "down" && "text-danger",
            delta.direction === "flat" && "text-ink-3",
          )}
        >
          {delta.text}
          {compare}
        </span>
      ) : (
        note && <span className="meta">{note}</span>
      )}
    </div>
  );
}

export function Card({
  title,
  aside,
  children,
  className,
  label,
}: {
  title?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section
      aria-label={label ?? title}
      className={cn("card flex min-w-0 flex-col gap-3 px-4 py-4 md:px-[18px]", className)}
    >
      {(title || aside) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {title && <h2 className="section-title">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** A post's picture, or a quiet stand-in. */
export function Thumb({ src, size = 44 }: { src: string | null; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- platform CDN, any host
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-md object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className="bg-subtle text-ink-4 inline-flex shrink-0 items-center justify-center rounded-md"
      style={{ width: size, height: size }}
    >
      <ImageIcon className="size-4" strokeWidth={1.5} />
    </span>
  );
}

/** A connected brand whose first numbers haven't arrived (design: Analytics, States). */
export function CollectingNumbers() {
  return (
    <IllustratedEmpty illustration="connect-accounts" title="Waggle is collecting your numbers">
      Your posts and followers from the last 12 months are on their way. The first numbers show
      within the hour; Instagram reach can take a day.
    </IllustratedEmpty>
  );
}

/** An account that stopped sending numbers: one danger line with the fix, in place. */
export function AccountProblems({ accounts }: { accounts: AnalyticsAccount[] }) {
  const down = accounts.filter((a) => a.status !== "active");
  if (down.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {down.map((a) => (
        <form
          key={a.id}
          action={connectAccount}
          className="danger-box flex flex-wrap items-center gap-x-3 gap-y-1"
        >
          <CircleAlert className="size-4 shrink-0" strokeWidth={2} aria-hidden />
          <span className="flex-1">
            {platformName(a.platform)}
            {a.username ? ` @${a.username}` : ""} stopped sending numbers. What&apos;s here is from
            before it disconnected.
          </span>
          <input type="hidden" name="platform" value={a.platform} />
          <Button type="submit" variant="secondary">
            Reconnect {platformName(a.platform)}
          </Button>
        </form>
      ))}
    </div>
  );
}

/** One plain line where a chart has nothing to show (design: a chart with no data says why). */
export function NoData({ children }: { children: React.ReactNode }) {
  return <p className="text-ink-2 py-6 text-center text-sm">{children}</p>;
}
