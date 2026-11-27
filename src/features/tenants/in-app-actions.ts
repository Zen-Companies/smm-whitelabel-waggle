"use server";

import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { z } from "zod";
import { detectInApp, switchDetails } from "@/features/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { getOpenOrg } from "./brands";

// "Any in-app browser" (hotfix approved 27 Nov): `inapp_switch_attempted`, the automatic switch
// to Safari or Chrome was tried. App and phone come from this request's own user agent, so a
// client can't write anything else; no user agent, address or customer text is kept (rule 10).
// At Connect (signed in, with an organization) it is an organization_audit row like
// `connect_blocked_in_app`; on sign-up and sign-in there is no one to file it under yet, so it is
// one structured log line (the server logs).

const DEDUPE_MS = 60 * 60 * 1000;
const inputSchema = z.object({
  where: z.enum(["signup", "signin", "connect"]),
  stayed: z.boolean(),
});

export async function recordInAppSwitch(input: {
  where: "signup" | "signin" | "connect";
  stayed: boolean;
}): Promise<void> {
  try {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) return;
    const ua = (await headers()).get("user-agent");
    // The page checked the home screen; the server can't, and an iPhone app it can't name looks
    // the same either way, so the page's word stands for those.
    const hit = detectInApp(ua);
    if (!hit) return;
    const details = switchDetails(hit, parsed.data.where, parsed.data.stayed);

    if (parsed.data.where === "connect") {
      const supabase = await createServerSupabase();
      const { data } = await supabase.auth.getUser();
      const org = data.user ? await getOpenOrg() : null;
      if (data.user && org) {
        const db = getServiceClient();
        const { count } = await db
          .from("organization_audit")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", org.id)
          .eq("action", "inapp_switch_attempted")
          .eq("actor", data.user.id)
          .eq("details->>app", details.app)
          .gte("created_at", new Date(Date.now() - DEDUPE_MS).toISOString());
        if ((count ?? 0) > 0) return;
        const { error } = await db.from("organization_audit").insert({
          organization_id: org.id,
          action: "inapp_switch_attempted",
          actor: data.user.id,
          details,
        });
        if (error) throw new Error(`organization_audit insert failed: ${error.message}`);
        return;
      }
    }
    console.info(JSON.stringify({ event: "inapp_switch_attempted", ...details }));
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "in-app-switch" } });
  }
}
