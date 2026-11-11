import "server-only";
import type { User } from "@supabase/supabase-js";
import type { ServiceClient } from "@/lib/supabase/service";
import { nudgesAllowed } from "./nudge-rules";
import { NUDGES, pageInfo, TYPE_LABEL, type FeedbackType, type NudgeKey } from "./pages";

export interface EarlierNote {
  id: string;
  line: string;
  at: string;
}

/** "Earlier from you": the last few notes, as "Analytics · Idea · first words". */
export async function loadEarlier(
  db: ServiceClient,
  userId: string,
  limit = 3,
): Promise<EarlierNote[]> {
  const { data } = await db
    .from("feedback")
    .select("id, page, type, message, created_at")
    .eq("user_id", userId)
    .eq("kind", "note")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((f) => ({
    id: f.id,
    line: [
      pageInfo(`/${f.page}`).name,
      f.type ? TYPE_LABEL[f.type as FeedbackType] : null,
      f.message.length > 60 ? `${f.message.slice(0, 57)}…` : f.message,
    ]
      .filter(Boolean)
      .join(" · "),
    at: f.created_at,
  }));
}

/**
 * Nudges this person may see now, at most one per page: the global rules (nudge-rules.ts), each
 * key once per person, and the "first" behind it actually happened.
 */
export async function eligibleNudges(
  db: ServiceClient,
  user: User,
  now = new Date(),
): Promise<NudgeKey[]> {
  const [{ data: shown }, { data: last }, { data: firsts }] = await Promise.all([
    db.from("feedback_nudges").select("key, shown_at, outcome").eq("user_id", user.id),
    db
      .from("feedback")
      .select("created_at")
      .eq("user_id", user.id)
      .eq("kind", "note")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("audit_log")
      .select("action")
      .eq("actor", user.id)
      .in("action", [
        "draft_approved",
        "draft_edited",
        "account_connected",
        "account_connect_started",
        "post_created",
        "post_submitted",
      ])
      .limit(50),
  ]);
  const allowed = nudgesAllowed(
    {
      createdAt: new Date(user.created_at),
      shown: (shown ?? []).map((s) => ({
        at: new Date(s.shown_at),
        dismissed: s.outcome === "dismissed",
      })),
      lastFeedbackAt: last ? new Date(last.created_at) : null,
    },
    now,
  );
  if (!allowed) return [];
  const seen = new Set((shown ?? []).map((s) => s.key));
  const did = new Set((firsts ?? []).map((a) => a.action));
  const happened: Record<NudgeKey, boolean> = {
    first_reply: did.has("draft_approved") || did.has("draft_edited"),
    first_analytics: true,
    first_connect: did.has("account_connect_started"),
    first_post: did.has("post_created") || did.has("post_submitted"),
  };
  return (Object.keys(NUDGES) as NudgeKey[]).filter((k) => happened[k] && !seen.has(k));
}

export interface FeedbackContext {
  organizationId: string | null;
  organization: string;
  tenantId: string | null;
  brand: string;
  role: string;
  betaCode: string;
}

/**
 * Where the person is, for GHL: their organization and brand (only ones they belong to), their
 * role there, and the beta code they joined with.
 */
export async function feedbackContext(
  db: ServiceClient,
  userId: string,
  orgId: string | null,
  tenantId: string | null,
): Promise<FeedbackContext> {
  const [{ data: member }, { data: brand }, { data: access }] = await Promise.all([
    orgId
      ? db
          .from("organization_members")
          .select("role, organizations (name)")
          .eq("organization_id", orgId)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    tenantId
      ? db
          .from("tenant_members")
          .select("tenants (id, name)")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("beta_access").select("via, beta_codes (code)").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    organizationId: member ? orgId : null,
    organization: member?.organizations?.name ?? "",
    tenantId: brand?.tenants?.id ?? null,
    brand: brand?.tenants?.name ?? "",
    role: member?.role ?? "",
    betaCode: access?.beta_codes?.code ?? (access ? access.via : ""),
  };
}
