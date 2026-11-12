import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { SocialProvider } from "@/lib/social";
import { SocialProviderError } from "@/lib/social/types";
import { templateNameFrom, toMetaBody } from "@/lib/social/whatsapp-templates";
import type { ServiceClient } from "@/lib/supabase/service";

// T67 (design v3 "WhatsApp · window and templates"): Settings → WhatsApp templates. Templates
// live on Meta; Waggle lists them and sends new ones for review in plain words.

export const newTemplateSchema = z.object({
  label: z
    .string()
    .trim()
    .min(3, "Give it a short name.")
    .max(60, "Keep the name under 60 characters."),
  kind: z.enum(["update", "promotion"]),
  text: z
    .string()
    .trim()
    .min(5, "Write the message.")
    .max(1024, "WhatsApp templates are 1,024 characters at most."),
});

/** The brand's active WhatsApp account, or null. */
export async function whatsappAccount(db: ServiceClient, tenantId: string) {
  const { data } = await db
    .from("social_accounts")
    .select("id, zernio_account_id, username")
    .eq("tenant_id", tenantId)
    .eq("platform", "whatsapp")
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data;
}

export type CreateTemplateResult =
  { ok: true; name: string } | { ok: false; error: "no_account" | "name_taken" | "rejected" };

export async function createTemplateFor(
  deps: { db: ServiceClient; social: SocialProvider },
  input: { tenantId: string; actor: string } & z.infer<typeof newTemplateSchema>,
): Promise<CreateTemplateResult> {
  const account = await whatsappAccount(deps.db, input.tenantId);
  if (!account) return { ok: false, error: "no_account" };
  const name = templateNameFrom(input.label);
  const { body, variables } = toMetaBody(input.text);
  const existing = await deps.social.listWhatsAppTemplates({
    accountId: account.zernio_account_id,
    signal: AbortSignal.timeout(15_000),
  });
  if (existing.some((t) => t.name === name && t.language === "en")) {
    return { ok: false, error: "name_taken" };
  }
  try {
    await deps.social.createWhatsAppTemplate({
      accountId: account.zernio_account_id,
      name,
      category: input.kind === "promotion" ? "MARKETING" : "UTILITY",
      language: "en",
      body,
      // Meta's reviewers see a sample value for each placeholder.
      examples: variables ? ["Ana"] : [],
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof SocialProviderError && error.details.status === 400) {
      return { ok: false, error: "rejected" };
    }
    throw error;
  }
  await writeAudit(deps.db, {
    tenantId: input.tenantId,
    action: "whatsapp_template_created",
    actor: input.actor,
    details: { name, kind: input.kind },
  });
  return { ok: true, name };
}
