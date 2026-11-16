import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { AutonomyCard, PauseForm, ReadinessCard } from "@/features/approvals";
import {
  answerQuestionAction,
  groupGaps,
  loadGaps,
  usageByEntry,
  usageText,
} from "@/features/knowledge-base";
import { TryIt } from "@/features/lab";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { QuestionAnswers } from "./question-answers";
import { unansweredQuestions } from "./teach";
import { TeachHeader } from "@/components/app/teach-header";

const SHOWN_ANSWERS = 12;
const weekAgo = () => new Date(Date.now() - 7 * 86_400_000).toISOString();

/**
 * Teach Waggle (T73, design "3 · Teach Waggle"): Business info, Replies and the Lab in one tab:
 * questions to answer, your answers, how Waggle replies, and Try it.
 */
export async function TeachView() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const [{ data: settings }, { data: entries }, { data: drafts }, gapRows] = await Promise.all([
    supabase.from("tenants").select("replies_paused").eq("id", tenant.id).single(),
    supabase
      .from("kb_entries")
      .select("id, title, content")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("drafts")
      .select("kb_entry_ids")
      .eq("tenant_id", tenant.id)
      .gte("created_at", weekAgo()),
    loadGaps(supabase, tenant.id, 50),
  ]);
  const answers = entries ?? [];
  const usage = usageByEntry(drafts ?? []);
  const questions = unansweredQuestions(groupGaps(gapRows, 10), answers);
  const canEdit = can(tenant.role, "brand.settings");
  const paused = settings?.replies_paused ?? false;

  return (
    <main className="mx-auto flex w-full max-w-[1320px] flex-col gap-6 px-4 py-6 md:px-6 md:py-9">
      <TeachHeader />
      {canEdit && <PauseForm paused={paused} />}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <QuestionAnswers questions={questions} answer={answerQuestionAction} canEdit={canEdit} />

          <section className="card flex flex-col gap-3 p-6" aria-labelledby="answers-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="answers-title" className="section-title">
                Your answers
              </h2>
              {canEdit && (
                <Link
                  href="/teach/business-info?topic=new"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  + Add an answer
                </Link>
              )}
            </div>
            {answers.length ? (
              <ul className="divide-line flex flex-col divide-y">
                {answers.slice(0, SHOWN_ANSWERS).map((a) => (
                  <li key={a.id} className="flex items-start gap-3 py-3.5">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <b className="font-semibold">{a.title}</b>
                      <span className="text-ink-2 line-clamp-2 text-sm">{a.content}</span>
                      <span className="meta">{usageText(usage.get(a.id) ?? 0)}</span>
                    </span>
                    <Link
                      href={`/teach/business-info?topic=${a.id}`}
                      className="action-link with-arrow shrink-0"
                    >
                      {canEdit ? "Edit" : "Open"}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-2 text-sm">
                No answers yet. Start with the basics: hours, where you are, prices and how to buy
                or book.
              </p>
            )}
            {answers.length > SHOWN_ANSWERS && (
              <Link href="/teach/business-info" className="action-link with-arrow self-start">
                See all {answers.length} answers
              </Link>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_380px] flex-col gap-6">
          <div className="card p-6" id="replies">
            <AutonomyCard variant="teach" />
          </div>
          <Suspense fallback={<div className="skeleton h-48 rounded-xl" />}>
            <ReadinessCard />
          </Suspense>
          <section className="flex flex-col gap-3" aria-labelledby="try-title" id="try">
            <div>
              <h2 id="try-title" className="section-title">
                Try it
              </h2>
              <p className="text-ink-3 mt-1 text-sm">
                Type what a customer might say. Nothing gets posted.
              </p>
            </div>
            <Suspense fallback={<div className="skeleton h-72 rounded-xl" />}>
              <TryIt />
            </Suspense>
          </section>
        </aside>
      </div>
    </main>
  );
}
