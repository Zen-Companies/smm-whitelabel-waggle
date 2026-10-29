import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  CATEGORY_HINTS,
  CATEGORY_LABELS,
  CONFIGURABLE_CATEGORIES,
  FIXED_BEHAVIOUR,
} from "./autonomy";
import { AutonomyForm } from "./autonomy-form";
import type { AutonomyMode } from "./policy";

/** Reply autonomy (PRD F9) in Settings. */
export async function AutonomyCard() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("autonomy_settings")
    .select("category, mode")
    .eq("tenant_id", tenant.id);
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
      <div className="card flex flex-col divide-y">
        {CONFIGURABLE_CATEGORIES.map((category) => (
          <AutonomyForm
            key={category}
            category={category}
            label={CATEGORY_LABELS[category]}
            hint={CATEGORY_HINTS[category]}
            mode={modes.get(category) ?? "off"}
          />
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
    </section>
  );
}
