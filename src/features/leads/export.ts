import "server-only";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadBoardLeads } from "./data";
import { leadsCsv } from "./lead-stage";

/** "Download list" (T74d): the brand's leads as a spreadsheet, read through RLS. */
export async function leadsCsvResponse(): Promise<Response> {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const leads = await loadBoardLeads(supabase, tenant.id);
  const body = leadsCsv(leads);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${body}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${day}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
