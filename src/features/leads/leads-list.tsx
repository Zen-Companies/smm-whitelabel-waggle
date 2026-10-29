import Link from "next/link";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";

// Leads the receptionist captured (PRD F12), newest first, each linked to its conversation.
export async function LeadsList() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, created_at, name, contact, request, item_id, " +
        "inbound_items (kind, author_name, social_accounts (platform))",
    )
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`leads load failed: ${error.message}`);
  const leads = (data ?? []) as unknown as {
    id: string;
    created_at: string;
    name: string | null;
    contact: string | null;
    request: string | null;
    item_id: string;
    inbound_items: {
      kind: "comment" | "dm";
      author_name: string | null;
      social_accounts: { platform: string } | null;
    } | null;
  }[];

  if (leads.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No leads yet. Bookings, orders and quote requests appear here.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {leads.map((lead) => {
        const source = lead.inbound_items;
        const platform =
          source?.social_accounts?.platform === "facebook" ? "Facebook" : "Instagram";
        return (
          <li key={lead.id} className="flex flex-col gap-1 rounded-lg border p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">
                {lead.name ?? source?.author_name ?? "No name given"}
              </span>
              <time dateTime={lead.created_at} className="text-muted-foreground text-xs">
                {new Date(lead.created_at).toLocaleString()}
              </time>
            </div>
            <p>{lead.request ?? "No request captured"}</p>
            <p className="text-muted-foreground">Contact: {lead.contact ?? "not given"}</p>
            <div className="text-muted-foreground flex gap-2 text-xs">
              <span>
                {platform} {source?.kind === "dm" ? "DM" : "comment"}
                {source?.author_name ? ` from ${source.author_name}` : ""}
              </span>
              <Link href={`/inbox/items/${lead.item_id}`} className="text-foreground underline">
                View conversation
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
