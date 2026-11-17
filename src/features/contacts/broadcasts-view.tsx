import * as Sentry from "@sentry/nextjs";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import type { Broadcast } from "@/lib/social/types";
import { createServerSupabase } from "@/lib/supabase/server";
import { BroadcastForm, BroadcastRow, type BroadcastTemplate } from "./broadcasts-panels";
import { ContactsTabs } from "./contacts-tabs";

/** Contacts → Broadcasts (T78b, design "Contacts · Broadcasts"): WhatsApp templates to a tag. */
export async function BroadcastsView() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { data: wa } = await supabase
    .from("social_accounts")
    .select("zernio_account_id, username")
    .eq("tenant_id", tenant.id)
    .eq("platform", "whatsapp")
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  let broadcasts: Broadcast[] = [];
  let templates: BroadcastTemplate[] = [];
  let unavailable = false;
  if (tenant.zernioProfileId) {
    try {
      const social = getSocialProvider();
      broadcasts = await social.listBroadcasts({
        profileId: tenant.zernioProfileId,
        signal: AbortSignal.timeout(10_000),
      });
      if (wa) {
        templates = (
          await social.listWhatsAppTemplates({ accountId: wa.zernio_account_id, signal: AbortSignal.timeout(10_000) })
        )
          .filter((t) => t.status === "APPROVED" && t.variables <= 1)
          .map((t) => ({ name: t.name, language: t.language, variables: t.variables, body: t.body }));
      }
    } catch (error) {
      Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "broadcasts" } });
      unavailable = true;
    }
  }
  const canEdit = can(tenant.role, "brand.settings");
  return (
    <div className="flex max-w-[960px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Contacts</h1>
        <p className="text-ink-2">One message to many people who agreed to hear from you.</p>
      </div>
      <ContactsTabs active="/contacts/broadcasts" />
      {unavailable ? (
        <p className="danger-box">Broadcasts couldn&apos;t be loaded right now. Try again in a moment.</p>
      ) : !wa ? (
        <p className="text-ink-2">Connect WhatsApp in Settings → Accounts to send broadcasts.</p>
      ) : (
        canEdit && <BroadcastForm accountId={wa.zernio_account_id} number={wa.username ?? "your number"} templates={templates} />
      )}
      {broadcasts.length > 0 && (
        <ul className="card divide-line flex flex-col divide-y">
          {broadcasts.map((b) => (
            <BroadcastRow key={b.id} b={b} canEdit={canEdit} />
          ))}
        </ul>
      )}
      <p className="meta">Texts (SMS) join once you have a Waggle phone number.</p>
    </div>
  );
}
