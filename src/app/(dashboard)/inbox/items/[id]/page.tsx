import { redirect } from "next/navigation";
import { Suspense } from "react";
import { tabForStatus } from "@/features/approvals";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";

// Alert emails and notifications link here; the conversation lives in the inbox (design v2).
async function ToInbox({ params }: { params: Promise<{ id: string }> }): Promise<never> {
  const { id } = await params;
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("inbound_items")
    .select("status")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (data) redirect(`/inbox?tab=${tabForStatus(data.status)}&item=${id}`);
  // T47: the item may belong to another of the user's brands (RLS shows only theirs).
  const { data: other } = await supabase
    .from("inbound_items")
    .select("tenant_id")
    .eq("id", id)
    .maybeSingle();
  redirect(
    other
      ? `/brands/switch?to=${other.tenant_id}&next=${encodeURIComponent(`/inbox/items/${id}`)}`
      : "/inbox",
  );
}

export default function InboxItemPage({ params }: PageProps<"/inbox/items/[id]">) {
  return (
    <Suspense fallback={null}>
      <ToInbox params={params} />
    </Suspense>
  );
}
