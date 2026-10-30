import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  CATEGORY_HINTS,
  CATEGORY_LABELS,
  CONFIGURABLE_CATEGORIES,
  FIXED_BEHAVIOUR,
} from "./autonomy";
import { AutonomyForm } from "./autonomy-form";
import { PauseForm } from "./pause-form";
import type { AutonomyMode } from "./policy";

/** Reply autonomy (PRD F9) in Settings: the switches only. Practice and readiness: /lab (T35). */
export async function AutonomyCard() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const [{ data }, { data: settings }] = await Promise.all([
    supabase.from("autonomy_settings").select("category, mode").eq("tenant_id", tenant.id),
    supabase.from("tenants").select("replies_paused").eq("id", tenant.id).single(),
  ]);
  const modes = new Map((data ?? []).map((row) => [row.category, row.mode as AutonomyMode]));

  return (
    <section className="flex flex-col gap-4" aria-labelledby="autonomy-heading">
      <div>
        <h2 id="autonomy-heading" className="section-title">
          Replies
        </h2>
        <p className="text-wax-muted">
          What Waggle does with each kind of message. Changes apply to the next message.
        </p>
      </div>
      <PauseForm paused={settings?.replies_paused ?? false} />
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
                <span className="text-wax-muted text-sm">{CATEGORY_HINTS[category]}</span>
              </dt>
              <dd className="text-wax-muted text-sm font-medium">{FIXED_BEHAVIOUR[category]}</dd>
            </div>
          ))}
        </dl>
      </div>
      <Link
        href="/lab"
        className="card hover:bg-hive-high flex items-center gap-3 p-5 transition-colors duration-150"
      >
        <FlaskConical strokeWidth={1.75} className="size-5 shrink-0" aria-hidden />
        <span className="flex flex-col">
          <span className="font-semibold">Not sure yet? Try it in Lab</span>
          <span className="text-wax-muted text-sm">
            Try a message and see whether Waggle is ready to reply on its own.
          </span>
        </span>
      </Link>
    </section>
  );
}
