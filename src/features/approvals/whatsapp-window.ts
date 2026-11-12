import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialProvider } from "@/lib/social/types";
import type { Database } from "@/lib/supabase/database.types";
import { renderTemplate, templateLabel } from "@/lib/social/whatsapp-templates";
import { firstName } from "./decisions";
import type { InboxEntry } from "./inbox-data";
import type { TemplateChoice } from "./whatsapp-window-card";

/** Pure: a WhatsApp chat the owner holds whose 24-hour window has closed (T67). */
export function whatsappWindowClosed(
  entry: Pick<InboxEntry, "platform" | "kind" | "dmWindowClosesAt"> & { status: string },
  now = Date.now(),
): boolean {
  return (
    entry.platform === "whatsapp" &&
    entry.kind === "dm" &&
    entry.status === "escalated" &&
    !!entry.dmWindowClosesAt &&
    Date.parse(entry.dmWindowClosesAt) <= now
  );
}

/**
 * The approved templates the owner can send in this chat, previewed with the customer's first
 * name. Only templates with no placeholder or one (the name) are offered.
 */
export async function loadTemplateChoices(
  supabase: SupabaseClient<Database>,
  social: SocialProvider,
  entry: Pick<InboxEntry, "itemId" | "authorName">,
): Promise<{ templates: TemplateChoice[]; loadError: boolean }> {
  const { data } = await supabase
    .from("inbound_items")
    .select("social_accounts (zernio_account_id)")
    .eq("id", entry.itemId)
    .maybeSingle();
  const accountId = (data as unknown as { social_accounts: { zernio_account_id: string } | null })
    ?.social_accounts?.zernio_account_id;
  if (!accountId) return { templates: [], loadError: true };
  try {
    const all = await social.listWhatsAppTemplates({
      accountId,
      signal: AbortSignal.timeout(10_000),
    });
    const name = firstName(entry.authorName);
    return {
      loadError: false,
      templates: all
        .filter((t) => t.status === "APPROVED" && t.variables <= 1)
        .map((t) => ({
          id: t.id,
          label: templateLabel(t.name),
          preview: renderTemplate(t.body, t.variables ? [name] : []) || templateLabel(t.name),
        })),
    };
  } catch {
    return { templates: [], loadError: true };
  }
}
