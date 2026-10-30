import { CircleCheck, ShieldCheck } from "lucide-react";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "cn";
import {
  CATEGORY_HINTS,
  CATEGORY_LABELS,
  CONFIGURABLE_CATEGORIES,
  FIXED_BEHAVIOUR,
} from "./autonomy";
import { AutonomyForm } from "./autonomy-form";
import { PauseForm } from "./pause-form";
import type { AutonomyMode } from "./policy";
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

/** Reply autonomy (PRD F9) in Settings, with the pause switch, readiness and promises (T27). */
export async function AutonomyCard() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const [{ data }, { data: settings }, readiness] = await Promise.all([
    supabase.from("autonomy_settings").select("category, mode").eq("tenant_id", tenant.id),
    supabase.from("tenants").select("replies_paused").eq("id", tenant.id).single(),
    loadReadiness(supabase, tenant.id),
  ]);
  const modes = new Map((data ?? []).map((row) => [row.category, row.mode as AutonomyMode]));

  return (
    <section className="flex flex-col gap-4" aria-labelledby="autonomy-heading">
      <div>
        <h2 id="autonomy-heading" className="section-title">
          Replies
        </h2>
        <p className="text-gray-700">
          What the receptionist does with each kind of message. Changes apply to the next message.
        </p>
      </div>
      <PauseForm paused={settings?.replies_paused ?? false} />
      <div className="card flex flex-col divide-y">
        {CONFIGURABLE_CATEGORIES.map((category) => (
          <div key={category}>
            <AutonomyForm
              category={category}
              label={CATEGORY_LABELS[category]}
              hint={CATEGORY_HINTS[category]}
              mode={modes.get(category) ?? "off"}
            />
            <ReadinessLine r={readiness[category]} />
          </div>
        ))}
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 p-5">
          {(Object.keys(FIXED_BEHAVIOUR) as (keyof typeof FIXED_BEHAVIOUR)[]).map((category) => (
            <div key={category} className="contents">
              <dt className="flex flex-col">
                <span className="font-semibold">{CATEGORY_LABELS[category]}</span>
                <span className="text-sm text-gray-700">{CATEGORY_HINTS[category]}</span>
              </dt>
              <dd className="text-sm font-medium text-gray-700">{FIXED_BEHAVIOUR[category]}</dd>
            </div>
          ))}
        </dl>
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
