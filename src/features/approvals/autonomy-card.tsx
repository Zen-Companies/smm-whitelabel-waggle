import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { CATEGORY_LABELS, CONFIGURABLE_CATEGORIES, FIXED_BEHAVIOUR } from "./autonomy";
import { AutonomyForm } from "./autonomy-form";
import type { AutonomyMode } from "./policy";

export async function AutonomyCard() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("autonomy_settings")
    .select("category, mode")
    .eq("tenant_id", tenant.id);
  const modes = new Map((data ?? []).map((row) => [row.category, row.mode as AutonomyMode]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reply autonomy</CardTitle>
        <CardDescription>
          What the receptionist does with each kind of message. Changes apply to the next message.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {CONFIGURABLE_CATEGORIES.map((category) => (
          <AutonomyForm
            key={category}
            category={category}
            label={CATEGORY_LABELS[category]}
            mode={modes.get(category) ?? "off"}
          />
        ))}
        <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
          {(Object.keys(FIXED_BEHAVIOUR) as (keyof typeof FIXED_BEHAVIOUR)[]).map((category) => (
            <li key={category} className="flex justify-between gap-2">
              <span>{CATEGORY_LABELS[category]}</span>
              <span>{FIXED_BEHAVIOUR[category]}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
