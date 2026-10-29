import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/app/avatar";
import { IllustratedEmpty } from "@/components/app/illustrated-empty";
import { platformName, shortTime } from "@/components/app/time";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";

// Leads the receptionist captured (PRD F12), newest first, each linked to its conversation.
// Coral = a lead (docs/design.md §1).
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
      <IllustratedEmpty illustration="new-lead" title="Your first lead is on its way" tint="coral">
        When someone asks to book, order or get a quote, their details land here and in your email.
      </IllustratedEmpty>
    );
  }
  return (
    <ul className="card flex flex-col divide-y">
      {leads.map((lead) => {
        const source = lead.inbound_items;
        return (
          <li key={lead.id}>
            <Link
              href={`/inbox/items/${lead.item_id}`}
              className="flex items-start gap-4 p-4 transition-colors duration-150 hover:bg-gray-50 md:p-5"
            >
              <Avatar />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {lead.name ?? source?.author_name ?? "No name given"}
                  </span>
                  <span className="chip-lead">Lead</span>
                  <time className="meta ml-auto" dateTime={lead.created_at}>
                    {shortTime(lead.created_at)}
                  </time>
                </span>
                <span>{lead.request ?? "No request captured"}</span>
                <span className="meta">
                  {lead.contact ? `Contact: ${lead.contact} · ` : ""}
                  {platformName(source?.social_accounts?.platform)}{" "}
                  {source?.kind === "dm" ? "DM" : "comment"}
                  {source?.author_name ? ` from ${source.author_name}` : ""}
                </span>
              </span>
              <ChevronRight
                className="mt-1 shrink-0 text-gray-600"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="sr-only">View conversation</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
