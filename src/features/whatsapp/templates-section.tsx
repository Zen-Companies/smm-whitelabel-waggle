import { can } from "@/features/orgs";
import { getCurrentTenant, ReadOnlyNote } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import type { WhatsAppTemplate } from "@/lib/social/types";
import { statusText, templateLabel } from "@/lib/social/whatsapp-templates";
import { getServiceClient } from "@/lib/supabase/service";
import { NewTemplateForm } from "./new-template-form";
import { whatsappAccount } from "./templates";

const TONE = { ok: "text-success", wait: "text-honey-text", bad: "text-danger" } as const;

/** Settings → WhatsApp templates (T67). Read live from Meta through Zernio. */
export async function WhatsAppTemplatesSection() {
  const tenant = await getCurrentTenant();
  const account = await whatsappAccount(getServiceClient(), tenant.id);
  let templates: WhatsAppTemplate[] = [];
  let loadError = false;
  if (account) {
    try {
      templates = await getSocialProvider().listWhatsAppTemplates({
        accountId: account.zernio_account_id,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      loadError = true;
    }
  }
  return (
    <section className="flex flex-col gap-4" aria-labelledby="wa-templates-heading">
      <div>
        <h2 id="wa-templates-heading" className="section-title">
          WhatsApp templates
        </h2>
        <p className="meta">
          Messages Meta lets you send after the 24-hour window. Meta reviews each one, usually
          within a day.
        </p>
      </div>
      {!account ? (
        <p className="text-ink-2">Connect WhatsApp in Accounts first.</p>
      ) : loadError ? (
        <p role="alert" className="text-danger text-sm">
          Couldn&apos;t load your templates from WhatsApp. Reload in a minute.
        </p>
      ) : templates.length === 0 ? (
        <p className="text-ink-2">No templates yet.</p>
      ) : (
        <ul className="card flex flex-col divide-y">
          {templates.map((t) => {
            const s = statusText(t.status);
            return (
              <li key={`${t.id}-${t.language}`} className="flex items-center gap-3 px-5 py-3.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="font-semibold">{templateLabel(t.name)}</b>
                  <span className="text-ink-3 truncate text-[13px]">
                    {t.category === "MARKETING" ? "Promotion" : "Update"}
                    {t.body ? ` · ${t.body}` : ""}
                  </span>
                </span>
                <span className={`${TONE[s.tone]} text-[13px] whitespace-nowrap`}>
                  <span aria-hidden>● </span>
                  {s.text}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {account &&
        (can(tenant.role, "accounts.manage") ? (
          <NewTemplateForm />
        ) : (
          <ReadOnlyNote role={tenant.role} what="the WhatsApp templates" />
        ))}
    </section>
  );
}
