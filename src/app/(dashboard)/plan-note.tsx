import { ReplyLimitNotice } from "@/features/billing";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";

/** Replies running low or out (T86): the plan's note for the open brand's organization. */
export async function PlanNote({ where }: { where: "today" | "inbox" }) {
  const tenant = await getCurrentTenant();
  return (
    <ReplyLimitNotice
      orgId={tenant.organizationId}
      isOwner={can(tenant.role, "billing.view")}
      where={where}
    />
  );
}
