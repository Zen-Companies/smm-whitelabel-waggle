"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

/**
 * Re-renders the inbox when a draft or item of this tenant changes (Supabase Realtime, PRD F8).
 * Rows arrive through RLS; the page re-reads them on the server rather than trusting the payload.
 */
export function InboxLive({ tenantId }: { tenantId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = getBrowserSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A run moves several rows at once: one refresh per burst.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    const filter = `tenant_id=eq.${tenantId}`;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let cancelled = false;

    // Join with the owner's token, not the anon key: RLS decides which rows Realtime delivers,
    // and a channel joined before the session loads would receive nothing.
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`inbox:${tenantId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "drafts", filter }, refresh)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "inbound_items", filter },
          refresh,
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router, tenantId]);

  return null;
}
