import * as Sentry from "@sentry/nextjs";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import type { AdLead, LeadForm } from "@/lib/social/types";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdLeadRow, LEAD_STATUS, LeadFormBuilder } from "./ad-leads-panels";
import { ContactsTabs } from "./contacts-tabs";

/** Contacts → Ad leads (T78c, design "Contacts · Leads from ad lead forms"). */
export async function AdLeadsView() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { data: pages } = await supabase
    .from("social_accounts")
    .select("zernio_account_id, username")
    .eq("tenant_id", tenant.id)
    .eq("platform", "facebook")
    .eq("status", "active");
  const pageIds = (pages ?? []).map((p) => p.zernio_account_id);
  let leads: AdLead[] = [];
  let forms: LeadForm[] = [];
  let unavailable = false;
  if (pageIds.length) {
    try {
      const social = getSocialProvider();
      leads = await social.listAdLeads({ accountIds: pageIds, signal: AbortSignal.timeout(15_000) });
      forms = (
        await Promise.all(
          pageIds.map((id) => social.listLeadForms({ accountId: id, signal: AbortSignal.timeout(15_000) })),
        )
      ).flat();
    } catch (error) {
      Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "adLeads" } });
      unavailable = true;
    }
  }
  const counts = leads.reduce<Record<string, number>>((m, l) => ({ ...m, [l.status]: (m[l.status] ?? 0) + 1 }), {});
  return (
    <div className="flex max-w-[960px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Contacts</h1>
        <p className="text-ink-2">People who filled a form in your Facebook or Instagram ads.</p>
      </div>
      <ContactsTabs active="/contacts/ad-leads" />
      {!pageIds.length ? (
        <p className="text-ink-2">Connect your Facebook Page in Settings → Accounts to use lead forms.</p>
      ) : unavailable ? (
        <p className="danger-box">Ad leads couldn&apos;t be loaded right now. Try again in a moment.</p>
      ) : (
        <>
          {leads.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(LEAD_STATUS)
                .filter(([k]) => counts[k])
                .map(([k, s]) => (
                  <span key={k} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.tone}`}>
                    {s.label} {counts[k]}
                  </span>
                ))}
            </div>
          )}
          {leads.length ? (
            <ul className="card divide-line flex flex-col divide-y">
              {leads.map((l) => (
                <AdLeadRow key={l.id} lead={l} canEdit={can(tenant.role, "replies.approve")} />
              ))}
            </ul>
          ) : (
            <p className="text-ink-2">No leads yet. Make a form below, then choose it when you boost a post.</p>
          )}
          {forms.length > 0 && (
            <section className="flex flex-col gap-2" aria-labelledby="forms-title">
              <h2 id="forms-title" className="section-title">
                Your forms
              </h2>
              <ul className="card divide-line flex flex-col divide-y">
                {forms.map((f) => (
                  <li key={f.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <b className="font-semibold">{f.name}</b>
                    <span className="text-ink-3">{f.status === "active" ? "Ready to use" : f.status}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {can(tenant.role, "brand.settings") && (
            <LeadFormBuilder pages={(pages ?? []).map((p) => ({ id: p.zernio_account_id, name: p.username ?? "Your Page" }))} />
          )}
          <p className="meta">Leads arrive within seconds of being sent. Meta reviews every ad that uses a form.</p>
        </>
      )}
    </div>
  );
}
