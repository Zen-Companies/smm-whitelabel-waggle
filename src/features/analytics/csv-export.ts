import "server-only";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadAccounts, loadPostMetrics } from "./data";
import { parsePeriod, parsePlatform, windowFor } from "./period";
import {
  filterPosts,
  parseDir,
  parseMade,
  parseSort,
  parseType,
  postsCsv,
  sortPosts,
} from "./posts";

/** "Download CSV" (T50): the Posts table as shown (same period, platform, filters and order). */
export async function postsCsvResponse(params: URLSearchParams): Promise<Response> {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const accounts = await loadAccounts(supabase, tenant.id);
  const get = (k: string) => params.get(k) ?? undefined;
  const period = parsePeriod(get("period"));
  const platform = parsePlatform(
    get("platform"),
    accounts.map((a) => a.platform),
  );
  const w = windowFor(period, new Date());
  const posts = await loadPostMetrics(supabase, tenant.id, { from: w.from, to: w.to, platform });
  const rows = sortPosts(
    filterPosts(posts, parseMade(get("made")), parseType(get("type"))),
    parseSort(get("sort")),
    parseDir(get("dir")),
  );
  // A byte-order mark so spreadsheet apps read the captions as UTF-8.
  return new Response(`﻿${postsCsv(rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="posts-${w.fromDate}-to-${w.toDate}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
