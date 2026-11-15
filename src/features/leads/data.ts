import type { SupabaseClient } from "@supabase/supabase-js";
import { platformName } from "@/components/app/time";
import type { Database } from "@/lib/supabase/database.types";
import { leadStage, type LeadStage } from "./lead-stage";

export interface BoardLead {
  id: string;
  createdAt: string;
  name: string;
  contact: string | null;
  wants: string | null;
  quote: string;
  itemId: string;
  itemStatus: string;
  platform: string | null;
  source: string;
  stage: LeadStage;
}

/** The brand's leads for the board and the download (through RLS), newest first. */
export async function loadBoardLeads(
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<BoardLead[]> {
  const { data, error } = await db
    .from("leads")
    .select(
      "id, created_at, name, contact, request, item_id, stage, " +
        "inbound_items (kind, status, text, author_name, social_accounts (platform))",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`leads load failed: ${error.message}`);
  const rows = (data ?? []) as unknown as {
    id: string;
    created_at: string;
    name: string | null;
    contact: string | null;
    request: string | null;
    item_id: string;
    stage: string | null;
    inbound_items: {
      kind: string;
      status: string;
      text: string;
      author_name: string | null;
      social_accounts: { platform: string } | null;
    } | null;
  }[];
  return rows.map((r) => {
    const item = r.inbound_items;
    const platform = item?.social_accounts?.platform ?? null;
    return {
      id: r.id,
      createdAt: r.created_at,
      name: r.name ?? item?.author_name ?? "No name given",
      contact: r.contact,
      wants: r.request,
      quote: item?.text ?? "",
      itemId: r.item_id,
      itemStatus: item?.status ?? "",
      platform,
      source: `${platformName(platform ?? undefined)} ${item?.kind === "dm" ? "DM" : (item?.kind ?? "comment")}`,
      stage: leadStage(r.stage, item?.status ?? ""),
    };
  });
}
