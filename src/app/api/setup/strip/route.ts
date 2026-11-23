import * as Sentry from "@sentry/nextjs";
import { loadSetupStrip } from "@/features/setup";
import { getTenantFor } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";

// Step 2's 30-day strip while Waggle reads (approved 21 Nov): asked every few seconds next to
// /api/catch-up/progress. Signed-in users only, for the brand open in their session. Counts and
// dates only, never message text. 204 when the brand has no catch-up.

export async function GET(): Promise<Response> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const tenant = await getTenantFor("inbox.read");
  if (!tenant) return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    const days = await loadSetupStrip(getServiceClient(), tenant.id);
    if (!days) return new Response(null, { status: 204, headers: noStore });
    return Response.json({ days }, { headers: noStore });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id } });
    return Response.json({ error: "failed" }, { status: 500 });
  }
}

const noStore = { "Cache-Control": "no-store" };
