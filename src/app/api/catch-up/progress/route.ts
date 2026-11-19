import * as Sentry from "@sentry/nextjs";
import { loadCatchUpProgress } from "@/features/catch-up";
import { getTenantFor } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";

// First connect (20 Nov): the reading screen asks this every 2 seconds. Signed-in users only;
// the brand is the one open in their session (getTenantFor reads it through RLS), so the service
// client only ever reads that brand's catch-up. 204 when the brand has no catch-up.

export async function GET(): Promise<Response> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const tenant = await getTenantFor("inbox.read");
  if (!tenant) return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    const progress = await loadCatchUpProgress(getServiceClient(), tenant.id);
    if (!progress) return new Response(null, { status: 204, headers: noStore });
    return Response.json(progress, { headers: noStore });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id } });
    return Response.json({ error: "failed" }, { status: 500 });
  }
}

const noStore = { "Cache-Control": "no-store" };
