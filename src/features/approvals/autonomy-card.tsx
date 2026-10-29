import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { CATEGORY_LABELS, CONFIGURABLE_CATEGORIES, FIXED_BEHAVIOUR } from "./autonomy";
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
        <p className="meta">What happens to each kind of message. Changes apply to the next one.</p>
      </div>
      <div className="card flex flex-col divide-y px-5">
        {CONFIGURABLE_CATEGORIES.map((category) => (
          <AutonomyForm
            key={category}
            category={category}
            label={CATEGORY_LABELS[category]}
            mode={modes.get(category) ?? "off"}
          />
        ))}
        <ul className="flex flex-col gap-2 py-4 text-sm">
          {(Object.keys(FIXED_BEHAVIOUR) as (keyof typeof FIXED_BEHAVIOUR)[]).map((category) => (
            <li key={category} className="flex justify-between gap-2">
              <span className="font-medium">{CATEGORY_LABELS[category]}</span>
              <span className="text-gray-700">{FIXED_BEHAVIOUR[category]}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
