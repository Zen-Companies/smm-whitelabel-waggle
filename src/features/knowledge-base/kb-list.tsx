import Link from "next/link";
import { shortTime } from "@/components/app/time";
import { StateLabel } from "@/components/app/state-mark";
import { Button, buttonVariants } from "@/components/ui/button";
import { can } from "@/features/orgs";
import { getCurrentTenant, RoleGate } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "cn";
import { checkFoundFact } from "./actions";
import { dismissSuggestion } from "./gap-actions";
import { GAP_HELPER_MIN_QUESTIONS } from "./gap-helper";
import { loadGaps, loadPendingSuggestions } from "./gaps";
import { KbEntryForm } from "./kb-entry-form";
import { KB_TITLE_MAX } from "./limits";
import { SuggestButton } from "./suggest-button";
import { matchTopics, usageByEntry, usageText } from "./usage";
import { TeachHeader } from "@/components/app/teach-header";

// Business info (design v2): topics with search and how often each was used | the one topic being
// edited | questions customers asked that the info didn't answer, with "Add an answer" and the gap
// helper's suggested topics (T33).

/** Where Waggle found a not-checked topic (decision 7), in the owner's words. */
const FOUND_ON: Record<string, string> = {
  facebook_page: "your Facebook Page",
  instagram_profile: "your Instagram profile",
  post_caption: "your posts",
};

const weekAgo = () => new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();

/** "today" instead of a clock time. */
const dayOnly = (label: string) => (/\d:\d/.test(label) ? "today" : label);

function href(p: { topic?: string; q?: string; from?: string; suggestion?: string }) {
  const s = new URLSearchParams();
  if (p.q) s.set("q", p.q);
  if (p.topic) s.set("topic", p.topic);
  if (p.from) s.set("from", p.from);
  if (p.suggestion) s.set("suggestion", p.suggestion);
  const out = s.toString();
  return out ? `/teach/business-info?${out}` : "/teach/business-info";
}

export async function KbList({
  searchParams,
  top,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  /** Under the Teach Waggle tabs (the "Get Waggle ready" line). */
  top?: React.ReactNode;
}) {
  const params = await searchParams;
  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const q = str("q") ?? "";
  const topicParam = str("topic");
  const from = str("from");
  const suggestionParam = str("suggestion");

  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const since = weekAgo();
  const [{ data: entryRows }, { data: drafts }, gaps, suggestions] = await Promise.all([
    supabase
      .from("kb_entries")
      .select("id, title, content, embedding, updated_at, needs_check, found_source")
      .eq("tenant_id", tenant.id)
      .order("created_at"),
    supabase
      .from("drafts")
      .select("kb_entry_ids")
      .eq("tenant_id", tenant.id)
      .gte("created_at", since),
    // Questions the info couldn't answer that are still waiting for the owner.
    loadGaps(supabase, tenant.id, 5),
    loadPendingSuggestions(supabase, tenant.id),
  ]);
  const entries = entryRows ?? [];
  const usage = usageByEntry(drafts ?? []);
  const shown = matchTopics(entries, q);
  const isNew = topicParam === "new" || entries.length === 0;
  const selected = isNew ? undefined : (entries.find((e) => e.id === topicParam) ?? shown[0]);
  const gap = from ? gaps.find((g) => g.itemId === from) : undefined;
  const suggestion = suggestionParam
    ? suggestions.find((s) => s.id === suggestionParam)
    : undefined;
  const prefill = suggestion?.title ?? gap?.text.slice(0, KB_TITLE_MAX);
  const mayEdit = can(tenant.role, "brand.settings");

  return (
    <>
      <TeachHeader>{top}</TeachHeader>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <h2 className="section-title">Business info</h2>
          <p className="text-ink-2">
            The only facts Waggle uses in replies. If it isn&apos;t here, it asks you.
          </p>
        </div>
      </header>

      {/* Each area scrolls on its own; on a wide screen the page fits it (approved 16 Nov). */}
      <div className="grid gap-5 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)_minmax(260px,320px)] xl:grid-rows-[minmax(0,1fr)]">
        <div className="card flex min-h-0 flex-col gap-2 p-3">
          {entries.length > 0 ? (
            <>
              <form action="/teach/business-info" className="flex flex-col gap-2" role="search">
                <label htmlFor="find" className="meta">
                  Find a topic
                </label>
                <input
                  id="find"
                  name="q"
                  type="search"
                  defaultValue={q}
                  placeholder="e.g. parking"
                  className="field"
                />
              </form>
              <p className="meta px-1">
                {entries.length === 1 ? "1 topic" : `${entries.length} topics`}
              </p>
              <ul
                aria-label="Topics"
                className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1"
              >
                {shown.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={href({ topic: e.id, q })}
                      aria-current={e.id === selected?.id ? "true" : undefined}
                      className={cn(
                        "flex flex-col rounded-md px-3 py-2.5 transition-colors duration-150",
                        e.id === selected?.id ? "bg-subtle" : "hover:bg-subtle",
                      )}
                    >
                      <span className={e.id === selected?.id ? "font-semibold" : "font-medium"}>
                        {e.title}
                      </span>
                      {e.needs_check ? (
                        <StateLabel state="waiting" className="meta">
                          Not checked
                        </StateLabel>
                      ) : (
                        <span className="meta">{usageText(usage.get(e.id) ?? 0)}</span>
                      )}
                    </Link>
                  </li>
                ))}
                {shown.length === 0 && <li className="meta px-3 py-2">No topic matches.</li>}
              </ul>
            </>
          ) : (
            <p className="meta px-1">
              No topics yet. Start with the basics: hours, location, prices and what you offer.
            </p>
          )}
          {mayEdit && (
            <Link
              href={href({ topic: "new", q })}
              className={cn(buttonVariants({ variant: "primary" }), "mt-auto w-full")}
            >
              + Add a topic
            </Link>
          )}
        </div>

        <div className="min-h-0 overflow-y-auto">
          <RoleGate allowed={mayEdit} role={tenant.role} what="the business info">
            {selected?.needs_check && (
              <section
                aria-label="Not checked"
                className="card mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 p-4"
              >
                <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
                  <StateLabel state="waiting">Not checked</StateLabel>
                  <p className="text-ink-2 text-sm">
                    Waggle found this on {FOUND_ON[selected.found_source ?? ""] ?? "your account"}.
                    It won&apos;t use it in a reply on its own until you check it&apos;s right. Fix
                    anything below and save, or:
                  </p>
                </div>
                <form action={checkFoundFact}>
                  <input type="hidden" name="id" value={selected.id} />
                  <Button type="submit" variant="secondary">
                    Mark as checked
                  </Button>
                </form>
              </section>
            )}
            {selected ? (
              <KbEntryForm
                key={selected.id}
                entry={{
                  id: selected.id,
                  title: selected.title,
                  content: selected.content,
                  searchable: selected.embedding !== null,
                }}
                changed={dayOnly(shortTime(selected.updated_at))}
              />
            ) : (
              <KbEntryForm
                key={`new-${from ?? ""}-${suggestion?.id ?? ""}`}
                prefillTitle={prefill}
                prefillContent={suggestion?.content}
                suggestionId={suggestion?.id}
              />
            )}
          </RoleGate>
        </div>

        <aside
          aria-labelledby="gaps"
          className="card flex min-h-0 flex-col gap-3 overflow-y-auto p-4 lg:col-start-2 xl:col-start-3"
        >
          <h2 id="gaps" className="font-semibold">
            Questions your info didn&apos;t answer
          </h2>
          {gaps.length === 0 ? (
            <p className="meta">
              None waiting. When a customer asks something your info doesn&apos;t cover, it shows up
              here.
            </p>
          ) : (
            <>
              <p className="meta">Add an answer once and Waggle can reply next time.</p>
              <ul className="flex flex-col divide-y">
                {gaps.map((g) => (
                  <li key={g.itemId} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-sm">&ldquo;{g.text}&rdquo;</span>
                    <span className="meta">
                      {g.authorName ?? "A customer"} · {shortTime(g.createdAt)}
                    </span>
                    <Link
                      href={href({ topic: "new", from: g.itemId })}
                      className="text-honey-text -ml-3 flex min-h-11 items-center self-start px-3 text-sm font-medium"
                    >
                      Add an answer
                    </Link>
                  </li>
                ))}
              </ul>
              {mayEdit && gaps.length >= GAP_HELPER_MIN_QUESTIONS && <SuggestButton />}
            </>
          )}
          {mayEdit && suggestions.length > 0 && (
            <section aria-labelledby="suggested" className="flex flex-col gap-2 border-t pt-3">
              <h3 id="suggested" className="font-semibold">
                Suggested topics
              </h3>
              <p className="meta">
                Grouped from these questions. You fill in the details; nothing is used until you add
                it.
              </p>
              <ul className="flex flex-col divide-y">
                {suggestions.map((s) => (
                  <li key={s.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-sm font-medium">{s.title}</span>
                    <span className="meta">
                      {s.questions === 1
                        ? "Answers 1 question"
                        : `Answers ${s.questions} questions`}
                    </span>
                    <div className="flex items-center gap-1">
                      <Link
                        href={href({ topic: "new", suggestion: s.id })}
                        className="text-honey-text -ml-3 flex min-h-11 items-center px-3 text-sm font-medium"
                      >
                        Add this topic
                      </Link>
                      <form action={dismissSuggestion}>
                        <input type="hidden" name="id" value={s.id} />
                        <button
                          type="submit"
                          className="hover:text-ink text-ink-2 flex min-h-11 items-center px-3 text-sm"
                        >
                          Not needed
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
