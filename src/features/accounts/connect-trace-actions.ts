"use server";

import { headers } from "next/headers";
import { getTenantFor } from "@/features/tenants";
import { getServiceClient } from "@/lib/supabase/service";
import { parseConnectReturn } from "./connect-trace";
import { recordConnectReturn, traceQuietly } from "./connect-trace-store";

/**
 * Fix 1 (24 Nov): a page reached from a connect's sign-in reports the return, so every outcome
 * and Zernio's error fields are kept (connect_attempts). Only the open brand's own attempt is
 * touched; params are checked by zod (parseConnectReturn). Says nothing back: the page already
 * tells the owner what happened.
 */
export async function traceConnectReturn(
  params: Record<string, string>,
  always: boolean,
): Promise<void> {
  const ret = parseConnectReturn(params, always === true);
  if (!ret) return;
  await traceQuietly(async () => {
    const tenant = await getTenantFor("accounts.manage");
    if (!tenant) return;
    const userAgent = (await headers()).get("user-agent");
    await recordConnectReturn(getServiceClient(), {
      tenantId: tenant.id,
      userId: tenant.userId,
      ret,
      userAgent,
    });
  });
}
