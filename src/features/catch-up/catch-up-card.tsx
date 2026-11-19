import Link from "next/link";
import { X } from "lucide-react";
import { ActionLink } from "@/components/app/action-link";
import { PlatformMark } from "@/components/app/platform-mark";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentTenant } from "@/features/tenants";
import { platformLabel } from "@/lib/social/platforms";
import { createServerSupabase } from "@/lib/supabase/server";
import { dismissCatchUp } from "./actions";
import { loadCatchUp } from "./data";
import { accountHandle, catchUpCopy, pullsPastDms } from "./rules";

/**
 * Today, right after the first connect (approved 19 Nov): what Waggle caught up on, and the DMs
 * too old to answer. Dismissable; nothing shows once dismissed.
 */
export async function CatchUpCard() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const summary = await loadCatchUp(supabase, tenant.id);
  if (!summary) return null;

  const copy = catchUpCopy({
    handle: accountHandle(summary.username, platformLabel(summary.platform)),
    finished: summary.finished,
    comments: summary.comments,
    dms: summary.dms,
    missed: summary.missed,
    pullsDms: pullsPastDms(summary.platform),
  });

  return (
    <section className="card relative p-6" aria-labelledby="catch-up-title">
      <form action={dismissCatchUp} className="absolute top-3 right-3">
        <input type="hidden" name="id" value={summary.id} />
        <button
          type="submit"
          aria-label="Dismiss"
          className={buttonVariants({ variant: "quiet", size: "icon" })}
        >
          <X className="size-[18px]" aria-hidden />
        </button>
      </form>

      <div className="flex items-center gap-3 pr-10">
        <PlatformMark platform={summary.platform} size={32} />
        <h2 id="catch-up-title" className="section-title">
          {copy.title}
        </h2>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5 text-[15px]">
        {copy.lines.map((line) => (
          <li key={line} className="text-ink-2">
            {line}
          </li>
        ))}
      </ul>

      {summary.finished && (
        <>
          <Link href="/inbox" className={`${buttonVariants({ variant: "primary" })} mt-4`}>
            Review drafts
          </Link>
          <p className="meta mt-2">Replies only count toward your plan when you approve them.</p>
        </>
      )}

      {copy.missedTitle && copy.missedLink && (
        <div className="border-line mt-5 border-t pt-4">
          <h3 className="text-[15px] font-semibold">{copy.missedTitle}</h3>
          <p className="text-ink-2 mt-1 text-sm">
            These DMs are older than 24 hours. Instagram and Facebook only let a business reply
            within 24 hours of the customer’s last message, so Waggle shows them but doesn’t draft.
            From now on, Waggle drafts new DMs as they arrive.
          </p>
          <ActionLink href="/inbox/missed" className="mt-3 inline-flex">
            {copy.missedLink}
          </ActionLink>
        </div>
      )}
    </section>
  );
}
