import * as Sentry from "@sentry/nextjs";
import { reconcileConnectedAccounts } from "@/features/accounts";
import { loadSetupConnected } from "@/features/setup";
import { getTenantFor } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";

// Setup's connecting screen (approved 23 Nov) asks every few seconds whether the brand open in
// the session is ready for step 2: an account connected and, if Waggle reads it, its read started
// (or it was read before). With `?reconcile=1` (sent after ~20 s) and still no account, it asks
// Zernio through SocialProvider in case the webhook got lost: at most once every 15 s per brand,
// held in the database (reconcileConnectedAccounts). Signed-in users who connect accounts only;
// a yes/no, nothing else.

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant) return Response.json({ error: "forbidden" }, { status: 403 });
  const db = getServiceClient();
  try {
    let state = await loadSetupConnected(db, tenant.id);
    if (!state.connected && new URL(request.url).searchParams.get("reconcile") === "1") {
      try {
        if (await reconcileConnectedAccounts({ db, social: getSocialProvider }, tenant.id)) {
          state = await loadSetupConnected(db, tenant.id);
        }
      } catch (e) {
        Sentry.captureException(e, { extra: { tenantId: tenant.id } });
      }
    }
    return Response.json({ connected: state.ready }, { headers: noStore });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id } });
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
