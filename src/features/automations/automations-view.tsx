import * as Sentry from "@sentry/nextjs";
import QRCode from "qrcode";
import Link from "next/link";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import type { ChatFlow, CommentAutomation, Sequence } from "@/lib/social/types";
import { createServerSupabase } from "@/lib/supabase/server";
import { AutomationsList } from "./automations-list";
import { FLOW_PLATFORMS } from "./chat-flow";
import { supportsCommentAutomation } from "./comment-dm";
import { FlowsSection } from "./flows-section";
import { isChatLink, LINK_PLATFORMS } from "./links";
import { LinksSection, type LinkFlow } from "./links-section";
import { SEQUENCE_PLATFORMS } from "./sequence";
import { SequencesSection, type SequenceTemplate } from "./sequences-section";
import { TeachHeader } from "@/components/app/teach-header";

const KINDS = [
  { key: "comment", label: "Comment to DM" },
  { key: "flows", label: "Chat flows" },
  { key: "sequences", label: "Sequences" },
  { key: "links", label: "Links and QR" },
] as const;
type Kind = (typeof KINDS)[number]["key"];

/**
 * Teach Waggle → Automations (T77, design "Automations"): replies that happen on their own, set
 * up once: comment to DM, chat flows, sequences, and links with QR codes.
 */
export async function AutomationsView({ kind: raw }: { kind?: string }) {
  const kind: Kind = KINDS.some((k) => k.key === raw) ? (raw as Kind) : "comment";
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { data: rows } = await supabase
    .from("social_accounts")
    .select("platform, username, zernio_account_id")
    .eq("tenant_id", tenant.id)
    .eq("status", "active")
    .order("created_at");
  const all = (rows ?? []).map((a) => ({
    zernioId: a.zernio_account_id,
    platform: a.platform,
    username: a.username,
  }));
  const canEdit = can(tenant.role, "brand.settings");

  let automations: CommentAutomation[] = [];
  let flows: ChatFlow[] = [];
  let sequences: Sequence[] = [];
  const templates: Record<string, SequenceTemplate[]> = {};
  let unavailable = false;
  if (tenant.zernioProfileId) {
    try {
      const social = getSocialProvider();
      const opts = { profileId: tenant.zernioProfileId, signal: AbortSignal.timeout(10_000) };
      if (kind === "comment") automations = await social.listCommentAutomations(opts);
      else if (kind === "flows" || kind === "links") flows = await social.listWorkflows(opts);
      else {
        sequences = await social.listSequences(opts);
        // WhatsApp follow-ups a day or more later need an approved template (≤ 1 placeholder).
        for (const a of all.filter((x) => x.platform === "whatsapp")) {
          const list = await social
            .listWhatsAppTemplates({ accountId: a.zernioId, signal: AbortSignal.timeout(10_000) })
            .catch(() => []);
          templates[a.zernioId] = list
            .filter((t) => t.status === "APPROVED" && t.variables <= 1)
            .map((t) => ({
              name: t.name,
              language: t.language,
              variables: t.variables,
              body: t.body,
            }));
        }
      }
    } catch (error) {
      Sentry.captureException(error, {
        extra: { tenantId: tenant.id, step: `automations:${kind}` },
      });
      unavailable = true;
    }
  }

  // Link flows (T77d) keep their ig.me / m.me link as the description; the rest are chat flows.
  const links: LinkFlow[] = await Promise.all(
    flows
      .filter((f) => isChatLink(f.description))
      .map(async (f) => ({
        ...f,
        qrSvg: await QRCode.toString(f.description, { type: "svg", margin: 1 }),
      })),
  );
  const plainFlows = flows.filter((f) => !isChatLink(f.description));

  return (
    <div className="flex max-w-[860px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <TeachHeader />
        <h2 className="section-title mt-2">Automations</h2>
        <p className="text-ink-2">Replies that happen on their own, set up once.</p>
      </div>
      <nav aria-label="Automation kinds" className="tabs">
        {KINDS.map((k) => (
          <Link
            key={k.key}
            href={`/automations?kind=${k.key}`}
            aria-current={k.key === kind ? "page" : undefined}
          >
            {k.label}
          </Link>
        ))}
      </nav>
      {unavailable ? (
        <p className="danger-box">
          Your automations couldn&apos;t be loaded right now. Try again in a moment.
        </p>
      ) : kind === "comment" ? (
        <>
          <AutomationsList
            automations={automations}
            accounts={all.filter((a) => supportsCommentAutomation(a.platform))}
            canEdit={canEdit}
          />
          <p className="meta">
            Instagram and Facebook get the DM. TikTok, Threads, LinkedIn and YouTube get the public
            reply only.
          </p>
        </>
      ) : kind === "links" ? (
        <LinksSection
          links={links}
          accounts={all.filter((a) => LINK_PLATFORMS.has(a.platform))}
          canEdit={canEdit}
        />
      ) : kind === "flows" ? (
        <FlowsSection
          flows={plainFlows}
          accounts={all.filter((a) => FLOW_PLATFORMS.has(a.platform))}
          canEdit={canEdit}
        />
      ) : (
        <SequencesSection
          sequences={sequences}
          accounts={all.filter((a) => SEQUENCE_PLATFORMS.has(a.platform))}
          templates={templates}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
