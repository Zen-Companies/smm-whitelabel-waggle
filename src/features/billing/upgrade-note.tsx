import Link from "next/link";
import { UPGRADE, upgradeHref, upgradeLabel, upgradeLine, type UpgradeReason } from "./upgrade";

/**
 * A limit said before anyone tries (Free plan, 20 Nov QA): in place of a form the plan doesn't
 * include, the limit's title, "To …, upgrade to … or above" and the way to the upgrade screen.
 * No toasts (design.md §4).
 */
export function UpgradeNote({ reason, isOwner }: { reason: UpgradeReason; isOwner: boolean }) {
  const copy = UPGRADE[reason];
  return (
    <section
      role="status"
      className="border-honey-border bg-honey-tint flex flex-col gap-2 rounded-xl border p-4"
    >
      <b className="text-[15px]">{copy.title}</b>
      <span className="text-ink-2 text-sm">
        {copy.why} {upgradeLine(reason)}
      </span>
      {isOwner ? (
        <Link
          href={upgradeHref(reason)}
          className="bg-ink inline-flex min-h-11 w-fit items-center rounded-xl px-4 text-sm font-semibold text-white"
        >
          {upgradeLabel(reason)}
        </Link>
      ) : (
        <span className="meta">The Owner can upgrade the plan on Your plan.</span>
      )}
    </section>
  );
}
