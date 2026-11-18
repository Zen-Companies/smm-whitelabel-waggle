// Waggle → GoHighLevel. Read README.md in this folder first.
import { createGhlClient, ghlConfig, type GhlClient } from "@/lib/ghl/client";

export { crmFields, crmPlan } from "./fields";
export type { CrmSnapshot } from "./fields";
export { deliverCrmEvents, CRM_MAX_ATTEMPTS } from "./sender";
export type { CrmSendSummary } from "./sender";
export { sweepInactive, touchActivity } from "./activity";
export { sweepUsage } from "./usage";

/** The HighLevel client from the environment, or null when it isn't set up (the queue waits). */
export function crmClient(): GhlClient | null {
  const config = ghlConfig();
  return config ? createGhlClient(config) : null;
}
