import Link from "next/link";
import { shortTime } from "@/components/app/time";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "cn";
import { dismissSuggestion } from "./gap-actions";
import { GAP_HELPER_MIN_QUESTIONS } from "./gap-helper";
import { loadGaps, loadPendingSuggestions } from "./gaps";
import { KbEntryForm } from "./kb-entry-form";
import { KB_TITLE_MAX } from "./limits";
import { SuggestButton } from "./suggest-button";
import { matchTopics, usageByEntry, usageText } from "./usage";

// Business info (design v2): topics with search and how often each was used | the one topic being
// edited | questions customers asked that the info didn't answer, with "Add an answer" and the gap
// helper's suggested topics (T33).

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
  return out ? `/knowledge-base?${out}` : "/knowledge-base";
}

export async function KbList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
      .select("id, title, content, embedding, updated_at")
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

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-1 flex-col gap-1">
          <h1 className="page-title">Business info</h1>
          <p className="text-gray-700">
            The only facts Waggle uses in replies. If it isn&apos;t here, it asks you.
          </p>
        </div>
        <Link href={href({ topic: "new", q })} className={buttonVariants({ variant: "primary" })}>
          Add a topic
        </Link>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)_minmax(260px,320px)]">
        <div className="flex flex-col gap-2">
          {entries.length > 0 ? (
            <>
              <form action="/knowledge-base" className="flex flex-col gap-2" role="search">
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
              <ul aria-label="Topics" className="mt-1 flex flex-col">
                {shown.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={href({ topic: e.id, q })}
                      aria-current={e.id === selected?.id ? "true" : undefined}
                      className={cn(
                        "flex flex-col rounded-md px-3 py-2.5 transition-colors duration-150",
                        e.id === selected?.id ? "bg-lavender" : "hover:bg-gray-50",
                      )}
                    >
                      <span className={e.id === selected?.id ? "font-semibold" : "font-medium"}>
                        {e.title}
                      </span>
                      <span className="meta">{usageText(usage.get(e.id) ?? 0)}</span>
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
        </div>

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

        <aside
          aria-labelledby="gaps"
          className="card flex flex-col gap-3 p-4 lg:col-start-2 xl:col-start-3"
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
                      className="text-violet-strong -ml-3 flex min-h-11 items-center self-start px-3 text-sm font-medium"
                    >
                      Add an answer
                    </Link>
                  </li>
                ))}
              </ul>
              {gaps.length >= GAP_HELPER_MIN_QUESTIONS && <SuggestButton />}
            </>
          )}
          {suggestions.length > 0 && (
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
                        className="text-violet-strong -ml-3 flex min-h-11 items-center px-3 text-sm font-medium"
                      >
                        Add this topic
                      </Link>
                      <form action={dismissSuggestion}>
                        <input type="hidden" name="id" value={s.id} />
                        <button
                          type="submit"
                          className="hover:text-ink flex min-h-11 items-center px-3 text-sm text-gray-700"
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
