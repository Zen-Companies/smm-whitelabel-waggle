// Where each page and section lives (routes, 16 Nov): places are paths, filters stay `?`.
//
//   /contacts (People) · /contacts/people · /contacts/leads · /contacts/ad-leads · /contacts/broadcasts
//   /teach (Overview) · /teach/business-info · /teach/automations/<kind> · /teach/lab
//   /inbox (For you) · /inbox/answered · /inbox/hidden          (?item= ?by= ?q= stay query)
//   /insights (Overview) · /insights/work · /insights/posts · /insights/audience   (?period= …)
//   /settings (Connected accounts) · /settings/<section>
//   /orgs/settings (Team) · /orgs/settings/<section>
//
// The old addresses (?section=, ?tab=, /leads, /knowledge-base, /automations, /lab, /analytics)
// forward here through `legacyPath`, used by the proxy. Pure.

/** Settings sections, in the order of the side menu. */
export const SETTINGS_SECTIONS = [
  "account",
  "general",
  "team",
  "billing",
  "accounts",
  "notifications",
  "business",
  "ai-assistants",
  "whatsapp",
  "phone",
  "messaging",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
export const DEFAULT_SETTINGS_SECTION: SettingsSection = "accounts";

export function isSettingsSection(value: string | undefined): value is SettingsSection {
  return (SETTINGS_SECTIONS as readonly string[]).includes(value ?? "");
}

type Query = Record<string, string | number | undefined | null>;

function withQuery(path: string, query: Query = {}, hash = ""): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return `${path}${s ? `?${s}` : ""}${hash}`;
}

/** `/settings/accounts?connected=bluesky` */
export function settingsHref(section: SettingsSection, query?: Query, hash = ""): string {
  return withQuery(`/settings/${section}`, query, hash);
}

/** Organization settings sections (the page outside a brand). */
export const ORG_SETTINGS_SECTIONS = ["account", "general", "team", "billing"] as const;
export type OrgSettingsSection = (typeof ORG_SETTINGS_SECTIONS)[number];
export const DEFAULT_ORG_SETTINGS_SECTION: OrgSettingsSection = "team";

export function isOrgSettingsSection(value: string | undefined): value is OrgSettingsSection {
  return (ORG_SETTINGS_SECTIONS as readonly string[]).includes(value ?? "");
}

export function orgSettingsHref(section: OrgSettingsSection): string {
  return `/orgs/settings/${section}`;
}

/** Insights sections; Overview is the bare /insights. */
export const INSIGHTS_SECTIONS = ["overview", "work", "posts", "audience"] as const;
export type InsightsSection = (typeof INSIGHTS_SECTIONS)[number];

export function isInsightsSection(value: string | undefined): value is InsightsSection {
  return (INSIGHTS_SECTIONS as readonly string[]).includes(value ?? "");
}

export function insightsHref(section: InsightsSection = "overview", query?: Query): string {
  return withQuery(section === "overview" ? "/insights" : `/insights/${section}`, query);
}

/** Inbox tabs as places. The "ignored" tab is called Hidden. */
export type InboxTabKey = "for_you" | "answered" | "ignored";
const INBOX_PATHS: Record<InboxTabKey, string> = {
  for_you: "/inbox",
  answered: "/inbox/answered",
  ignored: "/inbox/hidden",
};

export function inboxHref(tab: InboxTabKey = "for_you", query?: Query): string {
  return withQuery(INBOX_PATHS[tab], query);
}

/** Old ?tab= values, including the older To approve / Needs you / Sent names. */
function legacyInboxTab(value: string | null): InboxTabKey {
  if (value === "answered" || value === "sent") return "answered";
  if (value === "ignored" || value === "hidden") return "ignored";
  return "for_you";
}

/** Teach Waggle's parts. */
export const TEACH_BUSINESS_INFO = "/teach/business-info";
export const TEACH_LAB = "/teach/lab";

export function automationsHref(kind?: string): string {
  return kind ? `/teach/automations/${encodeURIComponent(kind)}` : "/teach/automations";
}

export function businessInfoHref(topic?: string): string {
  return withQuery(TEACH_BUSINESS_INFO, { topic });
}

export const CONTACTS_LEADS = "/contacts/leads";

export function leadsHref(query?: Query): string {
  return withQuery(CONTACTS_LEADS, query);
}

/** The query minus some keys, as a plain object. */
function rest(search: URLSearchParams, drop: string[]): Query {
  const out: Query = {};
  for (const [k, v] of search) if (!drop.includes(k)) out[k] = v;
  return out;
}

/**
 * Pure: where an old address lives now, or null when it's already current. Keeps every query
 * value the new page still reads (item, by, q, topic, period, email, connected…).
 */
export function legacyPath(pathname: string, search: URLSearchParams): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/leads") return withQuery(CONTACTS_LEADS, rest(search, []));
  if (path === "/leads/export") return withQuery(`${CONTACTS_LEADS}/export`, rest(search, []));

  if (path === "/knowledge-base") return withQuery(TEACH_BUSINESS_INFO, rest(search, []));
  if (path === "/automations") {
    return withQuery(automationsHref(search.get("kind") ?? undefined), rest(search, ["kind"]));
  }
  if (path === "/lab") return withQuery(TEACH_LAB, rest(search, []));

  if (path === "/analytics" || path === "/analytics/posts.csv") {
    if (path === "/analytics/posts.csv") return withQuery("/insights/posts.csv", rest(search, []));
    const section = search.get("section") ?? undefined;
    return insightsHref(
      isInsightsSection(section) ? section : "overview",
      rest(search, ["section"]),
    );
  }

  if (path === "/settings" && search.has("section")) {
    const section = search.get("section") ?? undefined;
    if (section === "replies") return "/teach#replies";
    return withQuery(
      `/settings/${isSettingsSection(section) ? section : DEFAULT_SETTINGS_SECTION}`,
      rest(search, ["section"]),
    );
  }

  if (path === "/orgs/settings" && search.has("section")) {
    const section = search.get("section") ?? undefined;
    return withQuery(
      orgSettingsHref(isOrgSettingsSection(section) ? section : DEFAULT_ORG_SETTINGS_SECTION),
      rest(search, ["section"]),
    );
  }

  if (path === "/inbox" && search.has("tab")) {
    return inboxHref(legacyInboxTab(search.get("tab")), rest(search, ["tab"]));
  }

  return null;
}
