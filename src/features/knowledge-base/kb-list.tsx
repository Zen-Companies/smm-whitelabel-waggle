import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { KbEntryForm } from "./kb-entry-form";

export async function KbList() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { data: entries } = await supabase
    .from("kb_entries")
    .select("id, title, content, embedding")
    .eq("tenant_id", tenant.id)
    .order("created_at");

  return (
    <div className="flex flex-col gap-4">
      <KbEntryForm />
      {(entries ?? []).map((e) => (
        <KbEntryForm
          key={e.id}
          entry={{ id: e.id, title: e.title, content: e.content, searchable: e.embedding !== null }}
        />
      ))}
    </div>
  );
}
