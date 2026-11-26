import Link from "next/link";
import { ActionLink } from "@/components/app/action-link";
import { SidePanel } from "@/components/app/side-panel";
import { StateLabel } from "@/components/app/state-mark";
import { TeachHeader } from "@/components/app/teach-header";
import { buttonVariants } from "@/components/ui/button";
import { AutonomyCard, PauseForm } from "@/features/approvals";
import {
  answerQuestionAction,
  groupGaps,
  loadGaps,
  usageByEntry,
  usageText,
} from "@/features/knowledge-base";
import { can } from "@/features/orgs";
import { ReadyLine } from "@/features/setup";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { QuestionAnswers } from "./question-answers";
import { repliesSummary, unansweredQuestions } from "./teach";

const SHOWN_ANSWERS = 3;
const weekAgo = () => new Date(Date.now() - 7 * 86_400_000).toISOString();

/**
 * Teach Waggle → Overview (approved 16 Nov: "each tab on one screen"): three short cards (the
 * next question to answer, your most-used answers, how Waggle replies), then one line each for
 * the Lab. Each card ends with a way to its full list; How Waggle replies opens in the side
 * panel.
 */
export async function TeachView({
  replies = false,
  justOn,
}: {
  replies?: boolean;
  /** After paying for Worker Bee: the row just switched on says so (Playbook round 2). */
  justOn?: "faq" | "lead";
}) {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const [{ data: settings }, { data: entries }, { data: drafts }, gapRows, { data: modes }] =
    await Promise.all([
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
      supabase.from("autonomy_settings").select("category, mode").eq("tenant_id", tenant.id),
    ]);
  const answers = entries ?? [];
  const usage = usageByEntry(drafts ?? []);
  // Most used first, so the three shown are the ones that matter.
  const topAnswers = [...answers]
    .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0))
    .slice(0, SHOWN_ANSWERS);
  const questions = unansweredQuestions(groupGaps(gapRows, 10), answers);
  const canEdit = can(tenant.role, "brand.settings");
  const paused = settings?.replies_paused ?? false;
  const summary = repliesSummary(modes ?? []);

  return (
    <main
      data-fit-screen
      className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-4 py-6 md:px-6 md:py-9 lg:min-h-0 lg:flex-1"
    >
      <TeachHeader>
        <ReadyLine />
      </TeachHeader>
      {canEdit && <PauseForm paused={paused} />}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <QuestionAnswers questions={questions} answer={answerQuestionAction} canEdit={canEdit} />

        <section className="card flex flex-col gap-3 p-6" aria-labelledby="answers-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="answers-title" className="section-title">
              Your answers
            </h2>
            <span className="text-ink-3 text-sm">{answers.length}</span>
          </div>
          {topAnswers.length ? (
            <ul className="divide-line flex flex-col divide-y">
              {topAnswers.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 py-2.5">
                  <Link
                    href={`/teach/business-info?topic=${a.id}`}
                    className="truncate font-semibold no-underline"
                  >
                    {a.title}
                  </Link>
                  <span className="meta">{usageText(usage.get(a.id) ?? 0)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-2 text-sm">
              No answers yet. Start with the basics: hours, where you are, prices and how to buy or
              book.
            </p>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            <ActionLink href="/teach/business-info">
              {answers.length ? `All ${answers.length} in Business info` : "Open Business info"}
            </ActionLink>
            {canEdit && (
              <Link
                href="/teach/business-info?topic=new"
                className={buttonVariants({ variant: "quiet" })}
              >
                + Add an answer
              </Link>
            )}
          </div>
        </section>

        <section
          className="card flex flex-col gap-3 p-6"
          aria-labelledby="replies-title"
          id="replies"
        >
          <h2 id="replies-title" className="section-title">
            How Waggle replies
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            {summary.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-3">
                <span className="font-medium">{s.label}</span>
                <StateLabel state={s.state}>{s.mode}</StateLabel>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-1">
            <ActionLink href="/teach?replies=1">
              {canEdit ? "Change" : "See the details"}
            </ActionLink>
          </div>
        </section>
      </div>

      <Link
        href="/teach/lab"
        className="card hover:bg-subtle flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 no-underline transition-colors duration-150"
      >
        <b className="text-ink font-semibold">Ready to reply on its own? · Try it</b>
        <span className="text-ink-2 min-w-[200px] flex-1 text-sm">
          Type what a customer might say and see Waggle&apos;s reply. Nothing gets posted.
        </span>
        <span className="action-link with-arrow">Open the Lab</span>
      </Link>

      {replies && (
        <SidePanel label="How Waggle replies" closeHref="/teach">
          <AutonomyCard variant="teach" justOn={justOn} />
        </SidePanel>
      )}
    </main>
  );
}
