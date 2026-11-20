import { X } from "lucide-react";
import { ActionLink } from "@/components/app/action-link";
import { buttonVariants } from "@/components/ui/button";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { getServiceClient } from "@/lib/supabase/service";
import { dismissTopQuestionsNotice } from "./actions";
import { READY_LATER_TOP } from "./busy-rules";
import { loadReadyLaterNotice } from "./reveal-data";

/**
 * Busy accounts (decided 20 Nov): the customers' own top questions came in after the owner went
 * past setup's step 3. Today and step 3 say so until the top 3 are answered or it's dismissed
 * (in place, recorded and audited). Only for people who can write answers.
 */
export async function TopQuestionsNotice() {
  const tenant = await getCurrentTenant();
  if (!can(tenant.role, "brand.settings")) return null;
  const notice = await loadReadyLaterNotice(getServiceClient(), tenant.id);
  if (!notice) return null;
  return (
    <section
      className="border-honey-border bg-honey-tint relative flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border py-3.5 pr-12 pl-5"
      aria-label="Your customers’ top questions"
    >
      <span className="text-[15px] font-semibold">
        Your customers’ top {READY_LATER_TOP} questions are ready
      </span>
      <span aria-hidden className="text-ink-3">
        ·
      </span>
      <ActionLink href="/teach">Answer them</ActionLink>
      <form action={dismissTopQuestionsNotice} className="absolute top-1.5 right-1.5">
        <input type="hidden" name="id" value={notice.catchUpId} />
        <button
          type="submit"
          aria-label="Dismiss"
          className={buttonVariants({ variant: "quiet", size: "icon" })}
        >
          <X className="size-[18px]" aria-hidden />
        </button>
      </form>
    </section>
  );
}
