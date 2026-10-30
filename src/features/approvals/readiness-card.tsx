import { CircleCheck, ShieldCheck } from "lucide-react";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "cn";
import { CATEGORY_LABELS, CONFIGURABLE_CATEGORIES } from "./autonomy";
import { PROMISES } from "./promises";
import { loadReadiness, type CategoryReadiness } from "./readiness-data";

/** Whether a category has earned auto-send, from the owner's own decisions (T27). */
function ReadinessLine({ r }: { r: CategoryReadiness }) {
  return (
    <div className="flex flex-col gap-1 px-5 pb-5 text-sm">
      {r.summary && <span className="text-gray-700">{r.summary}</span>}
      <span
        className={cn("inline-flex items-center gap-1 font-medium", !r.ready && "text-gray-700")}
      >
        {r.ready && <CircleCheck className="text-success size-4" strokeWidth={1.75} aria-hidden />}
        {r.verdict}
      </span>
      {r.edits.length > 0 && (
        <details className="mt-1">
          <summary className="text-violet-strong cursor-pointer font-medium">
            See the ones you edited
          </summary>
          <ul className="mt-2 flex flex-col gap-3">
            {r.edits.map((e) => (
              <li key={e.id} className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="meta">Suggested</span>
                  <p className="rounded-md bg-gray-50 p-3 whitespace-pre-wrap">{e.suggested}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="meta">What you sent</span>
                  <p className="bg-lavender rounded-md p-3 whitespace-pre-wrap">{e.sent}</p>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Owner Lab (T35): readiness per kind of message, and what the receptionist will never do. */
export async function ReadinessCard() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const readiness = await loadReadiness(supabase, tenant.id);
  return (
    <section className="flex flex-col gap-4" aria-labelledby="readiness-heading">
      <div>
        <h2 id="readiness-heading" className="section-title">
          Ready to reply on its own?
        </h2>
        <p className="text-gray-700">
          Based on the replies you checked with Ask me first. You decide when to switch.
        </p>
      </div>
      <div className="card flex flex-col divide-y">
        {CONFIGURABLE_CATEGORIES.map((category) => (
          <div key={category} className="flex flex-col pt-5">
            <span className="px-5 font-semibold">{CATEGORY_LABELS[category]}</span>
            <ReadinessLine r={readiness[category]} />
          </div>
        ))}
      </div>
      <div className="card flex flex-col gap-3 p-5">
        <h3 className="flex items-center gap-2 font-semibold">
          <ShieldCheck strokeWidth={1.75} className="size-5" aria-hidden />
          What your receptionist will never do
        </h3>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          {PROMISES.map((p) => (
            <li key={p.text}>{p.text}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
