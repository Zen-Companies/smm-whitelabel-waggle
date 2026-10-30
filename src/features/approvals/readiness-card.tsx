import { Check, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { AutoSendButton } from "./auto-send-button";
import { CATEGORY_LABELS, CONFIGURABLE_CATEGORIES, type ConfigurableCategory } from "./autonomy";
import { PROMISES } from "./promises";
import { loadReadiness, type CategoryReadiness } from "./readiness-data";

// "Ready to reply on its own?" on the owner's Lab (T27, T36 items 1-2; design v2 canvas, row 4).

const SENTENCE_LABEL: Record<ConfigurableCategory, string> = { faq: "questions", lead: "leads" };

function StatusPill({ r }: { r: CategoryReadiness }) {
  if (r.mode === "auto") {
    return (
      <span className="bg-success-soft text-success inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-xs font-semibold">
        <Check className="size-3.5" strokeWidth={2} aria-hidden />
        Auto-send is on
      </span>
    );
  }
  return r.ready ? (
    <span className="bg-success-soft text-success inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-xs font-semibold">
      <Check className="size-3.5" strokeWidth={2} aria-hidden />
      Ready
    </span>
  ) : (
    <span className="bg-amber-soft text-amber-text inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-xs font-semibold">
      <span className="bg-amber size-1.5 rounded-full" aria-hidden />
      Not yet
    </span>
  );
}

function Progress({ r }: { r: CategoryReadiness }) {
  const pct = r.progress.of ? Math.round((100 * r.progress.done) / r.progress.of) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="img"
        aria-label={`${r.progress.done} of ${r.progress.of}`}
        className="h-2 overflow-hidden rounded-full bg-gray-100"
      >
        <div
          className={r.ready ? "bg-success h-2 rounded-full" : "bg-amber h-2 rounded-full"}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="meta">
        {r.progress.done} of {r.progress.of} replies sent as you approved them
      </span>
    </div>
  );
}

function CategoryCard({ category, r }: { category: ConfigurableCategory; r: CategoryReadiness }) {
  const label = SENTENCE_LABEL[category];
  return (
    <article aria-labelledby={`ready-${category}`} className="card flex flex-col gap-3.5 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 id={`ready-${category}`} className="font-semibold">
          {CATEGORY_LABELS[category]}
        </h3>
        <StatusPill r={r} />
      </div>
      <Progress r={r} />
      <p className="text-sm">
        {r.mode === "auto"
          ? `Replies to ${label} go out on their own when your business info covers them.`
          : r.ready
            ? `You sent the suggested replies as written. ${CATEGORY_LABELS[category]} can go out on their own.`
            : r.verdict}
      </p>
      {r.ready && r.mode !== "auto" && <AutoSendButton category={category} label={label} />}

      {!r.ready && r.changes.length > 0 && (
        <div className="flex flex-col">
          <span className="meta font-medium">Where you made changes</span>
          <ul className="flex flex-col divide-y">
            {r.changes.slice(0, 4).map((c) => (
              <li key={c.title} className="flex min-h-11 items-center justify-between gap-2">
                <span className="text-sm">
                  <span className="font-semibold">{c.title}</span> ·{" "}
                  {c.count === 1 ? "1 change" : `${c.count} changes`}
                </span>
                <Link
                  href={
                    c.topicId ? `/knowledge-base?topic=${c.topicId}` : "/knowledge-base?topic=new"
                  }
                  className="text-violet-strong text-sm font-medium whitespace-nowrap"
                >
                  {c.topicId ? "Fix in Business info" : "Add an answer"}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.edits.length > 0 && (
        <details>
          <summary className="text-violet-strong flex min-h-11 cursor-pointer items-center text-sm font-medium">
            See the {r.edits.length === 1 ? "one" : r.edits.length} you edited
          </summary>
          <ul className="flex flex-col gap-3">
            {r.edits.map((e) => (
              <li key={e.id} className="grid grid-cols-2 gap-2 text-sm">
                <span className="meta">Suggested</span>
                <span className="meta">What you sent</span>
                <p className="rounded-md bg-gray-50 p-2.5 whitespace-pre-wrap">{e.suggested}</p>
                <p className="bg-lavender rounded-md p-2.5 whitespace-pre-wrap">{e.sent}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

/** Owner Lab: readiness per kind of message, and what Waggle will never do. */
export async function ReadinessCard() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const readiness = await loadReadiness(supabase, tenant.id);
  const nothingYet = CONFIGURABLE_CATEGORIES.every((c) => readiness[c].summary === null);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="readiness-heading">
      <div>
        <h2 id="readiness-heading" className="section-title">
          Ready to reply on its own?
        </h2>
        <p className="text-sm text-gray-700">
          From the replies you checked with Ask me first in the last 14 days.
        </p>
      </div>
      {nothingYet ? (
        <article className="card flex flex-col gap-3 p-5">
          <h3 className="font-semibold">Nothing to judge yet</h3>
          <p className="text-sm text-gray-700">
            Keep Ask me first on. After you&apos;ve checked about 10 replies for a kind of message,
            this tells you whether it&apos;s ready to reply on its own, and what to fix if it
            isn&apos;t.
          </p>
        </article>
      ) : (
        CONFIGURABLE_CATEGORIES.map((category) => (
          <CategoryCard key={category} category={category} r={readiness[category]} />
        ))
      )}
      <div className="card flex flex-col gap-2.5 p-5">
        <h3 className="flex items-center gap-2 font-semibold">
          <ShieldCheck strokeWidth={1.75} className="size-5" aria-hidden />
          What Waggle will never do
        </h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-gray-700">
          {PROMISES.map((p) => (
            <li key={p.text}>{p.text}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
