import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { can } from "@/features/orgs";
import { getCurrentTenant, RoleGate } from "@/features/tenants";
import { planAllowsAutoReply, UpgradeLink, upgradeLabel, upgradeLine } from "@/features/billing";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import {
  CATEGORY_HINTS,
  CATEGORY_LABELS,
  CONFIGURABLE_CATEGORIES,
  FIXED_BEHAVIOUR,
} from "./autonomy";
import { AutoHideForm } from "./auto-hide-form";
import { AutonomyForm } from "./autonomy-form";
import { PauseForm } from "./pause-form";
import type { AutonomyMode } from "./policy";

/**
 * Reply autonomy (PRD F9): the switches. In Settings with the pause and a Lab link; in Teach
 * Waggle (T73) under "How Waggle replies", where the pause sits in the page header and Try it is
 * on the same page.
 */
export async function AutonomyCard({ variant = "settings" }: { variant?: "settings" | "teach" }) {
  const teach = variant === "teach";
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const [{ data }, { data: settings }, autoOk] = await Promise.all([
    supabase.from("autonomy_settings").select("category, mode").eq("tenant_id", tenant.id),
    supabase.from("tenants").select("replies_paused, auto_hide_spam").eq("id", tenant.id).single(),
    planAllowsAutoReply(getServiceClient(), tenant.id),
  ]);
  const modes = new Map((data ?? []).map((row) => [row.category, row.mode as AutonomyMode]));

  return (
    <section className="flex flex-col gap-4" aria-labelledby="autonomy-heading">
      <div>
        <h2 id="autonomy-heading" className="section-title">
          {teach ? "How Waggle replies" : "Replies"}
        </h2>
        <p className="text-ink-2">
          {teach
            ? "Start with Ask me first. Switch once you trust it."
            : "What Waggle does with each kind of message. Changes apply to the next message."}
        </p>
      </div>
      <RoleGate
        allowed={can(tenant.role, "brand.settings")}
        role={tenant.role}
        what="the reply rules"
      >
        {!teach && <PauseForm paused={settings?.replies_paused ?? false} />}
        {!autoOk && (
          <p className="border-honey-border bg-honey-tint rounded-xl border px-4 py-3 text-sm">
            <b>On Free, you approve every reply.</b> {upgradeLine("auto_reply")}{" "}
            <UpgradeLink reason="auto_reply" className="action-link">
              {upgradeLabel("auto_reply")}
            </UpgradeLink>
          </p>
        )}
        <div className="card flex flex-col divide-y">
          {CONFIGURABLE_CATEGORIES.map((category) => (
            <AutonomyForm
              key={category}
              category={category}
              label={CATEGORY_LABELS[category]}
              hint={CATEGORY_HINTS[category]}
              mode={modes.get(category) ?? "off"}
              autoAllowed={autoOk}
            />
          ))}
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 p-5">
            {(Object.keys(FIXED_BEHAVIOUR) as (keyof typeof FIXED_BEHAVIOUR)[]).map((category) => (
              <div key={category} className="contents">
                <dt className="flex flex-col">
                  <span className="font-semibold">{CATEGORY_LABELS[category]}</span>
                  <span className="text-ink-2 text-sm">{CATEGORY_HINTS[category]}</span>
                </dt>
                <dd className="text-ink-2 text-sm font-medium">
                  {category === "spam" && !settings?.auto_hide_spam
                    ? "Never answered"
                    : FIXED_BEHAVIOUR[category]}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <AutoHideForm on={settings?.auto_hide_spam ?? false} />
      </RoleGate>
      {!teach && (
        <Link
          href="/teach/lab"
          className="card hover:bg-subtle flex items-center gap-3 p-5 transition-colors duration-150"
        >
          <FlaskConical strokeWidth={1.75} className="size-5 shrink-0" aria-hidden />
          <span className="flex flex-col">
            <span className="font-semibold">Not sure yet? Try it in Lab</span>
            <span className="text-ink-2 text-sm">
              Try a message and see whether Waggle is ready to reply on its own.
            </span>
          </span>
        </Link>
      )}
    </section>
  );
}
