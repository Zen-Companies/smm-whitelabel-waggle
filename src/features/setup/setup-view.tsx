import { getServiceClient } from "@/lib/supabase/service";
import { loadPlatformStatuses, statusOf } from "@/features/platforms";
import { Check } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { BeeBySend, BeeDance, BeeOnItsOwn } from "@/components/app/bee-setup";
import { PlatformMark } from "@/components/app/platform-mark";
import { StateMark } from "@/components/app/state-mark";
import { connectAccount } from "@/features/accounts";
import { orgOnFree, planAllowsAutoReply, upgradeHref, upgradeLabel } from "@/features/billing";
import {
  loadCatchUpProgress,
  loadTopQuestionsStatus,
  PracticeWait,
  ReadingInbox,
  TopQuestionsNotice,
  TopQuestionsWait,
} from "@/features/catch-up";
import { HelpButton } from "@/features/feedback";
import { TryIt } from "@/features/lab";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import {
  hasSetupCard,
  isConnectable,
  PLATFORM_IDS,
  PLATFORMS,
  platformLabel,
} from "@/lib/social/platforms";
import { createServerSupabase } from "@/lib/supabase/server";
import { saveAnswersStep, saveBusinessStep, saveRepliesStep } from "./actions";
import { nextReadyStep, PRACTICE_GOAL } from "./checklist";
import {
  commonForLabel,
  questionSeeds,
  type ConnectProblem,
  type QuestionSeed,
} from "./first-connect";
import { InAppGate } from "./in-app-gate";
import { KindPicker } from "./kind-picker";
import { QuestionsEditor } from "./questions-editor";
import { loadReadySteps } from "./ready-data";
import {
  BUSINESS_KINDS,
  customKindFromProfile,
  doneLine,
  kindFromProfile,
  NEXT_ACTION,
  stepDetail,
  SETUP_LAST,
  type SetupStepNumber,
} from "./starter";
import { StepForm } from "./step-form";
import { Stepper } from "./stepper";
import { suggestedQuestions } from "./suggest";

const FIRST_ACCOUNTS = [
  { platform: "instagram", does: "Comments and DMs" },
  { platform: "facebook", does: "Comments, DMs and reviews" },
] as const;

/**
 * "More" in step 2, opened in place (approved 17 Nov): every platform that connects through a
 * sign-in and comes back to this step. Ones that need a form in Settings (Bluesky, Telegram,
 * WhatsApp) wait until after setup.
 */
const MORE_ACCOUNTS = PLATFORM_IDS.filter(
  (id) =>
    id !== "instagram" &&
    id !== "facebook" &&
    isConnectable(id) &&
    !hasSetupCard(id) &&
    PLATFORMS[id].connect === "oauth",
);
const LATER_ACCOUNTS = PLATFORM_IDS.filter((id) => hasSetupCard(id));

/** Step 2's Connect buttons, behind the in-app browser note when there is one. */
function ConnectGate({ inApp, children }: { inApp: string | null; children: ReactNode }) {
  const list = <div className="flex flex-col gap-5">{children}</div>;
  return inApp ? <InAppGate app={inApp}>{list}</InAppGate> : list;
}

function SkipLink({ to }: { to: SetupStepNumber }) {
  return (
    <Link href={`/setup?step=${to}`} className="action-link">
      Skip for now
    </Link>
  );
}

/**
 * "Get Waggle ready" (T73b; 5 steps approved 17 Nov): your business, connect, top answers, try 3
 * messages, how replies go out. Every step can be skipped; opening /setup again lands on the first
 * step not done, and the same steps show on top of Teach Waggle and on Today until they are.
 */
export async function SetupView({
  step: requested,
  connecting,
  more = false,
  inApp = null,
  problem = null,
}: {
  step: SetupStepNumber | null;
  connecting?: string;
  /** Step 2 with every place to connect open. */
  more?: boolean;
  /** Open inside Instagram's or Facebook's own browser (first connect, 20 Nov). */
  inApp?: string | null;
  /** The connect flow came back with an error. */
  problem?: ConnectProblem | null;
}) {
  // Staff → Platforms (18 Nov): only Available platforms are offered here.
  const statuses = await loadPlatformStatuses(getServiceClient());
  const tenant = await getCurrentTenant();
  const [steps, autoOk] = await Promise.all([
    loadReadySteps(tenant.id),
    // Free approves every reply (19 Nov): Reply on its own shows, locked, with the upgrade.
    planAllowsAutoReply(getServiceClient(), tenant.id),
  ]);
  const step: SetupStepNumber = requested ?? nextReadyStep(steps)?.n ?? 6;
  const left = steps.filter((s) => !s.done);
  const tries = steps.find((s) => s.key === "practice");
  const triesDone = tries?.done
    ? PRACTICE_GOAL
    : Number(/^\d+/.exec(tries?.status ?? "")?.[0] ?? 0);
  const supabase = await createServerSupabase();
  const [{ data: t }, { data: accounts }, { count: answers }, { data: faq }] = await Promise.all([
    supabase.from("tenants").select("business_profile").eq("id", tenant.id).single(),
    supabase
      .from("social_accounts")
      .select("platform, status")
      .eq("tenant_id", tenant.id)
      .eq("status", "active"),
    supabase
      .from("kb_entries")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id),
    supabase
      .from("autonomy_settings")
      .select("mode")
      .eq("tenant_id", tenant.id)
      .eq("category", "faq")
      .maybeSingle(),
  ]);
  const profile = t?.business_profile ?? "";
  const kind = kindFromProfile(profile);
  const description = kind ? profile.split("\n").slice(1).join("\n") : profile;
  const custom = customKindFromProfile(profile);
  // First connect (approved 20 Nov): step 2 shows the live counters while Waggle reads, steps 3
  // and 4 use what the customers really asked, step 6 leads to the reveal.
  const service = getServiceClient();
  const [progress, topStatus, onFree] = await Promise.all([
    step === 2 || step === 6 ? loadCatchUpProgress(service, tenant.id) : null,
    step === 3 || step === 4 ? loadTopQuestionsStatus(service, tenant.id) : null,
    step === 2 ? orgOnFree(service, tenant.organizationId) : false,
  ]);
  const top = topStatus?.questions ?? [];
  // Busy accounts (decided 20 Nov): Waggle is still reading and the customers' own questions
  // aren't in yet, so steps 3 and 4 wait for them in place.
  const waitingForTop = topStatus?.waiting ?? false;
  // Step 3's suggestions: the kind's three, or for Something else, ones for what they typed
  // (not asked for when the customers' own questions already fill the step).
  const ai =
    step === 3 && kind?.key === "other" && custom && top.length < 3
      ? await suggestedQuestions(tenant.id, custom)
      : null;
  const questionKind = kind ?? BUSINESS_KINDS[BUSINESS_KINDS.length - 1];
  const suggested = ai ? ai.slice(0, 3) : [...questionKind.questions];
  const moreQuestions = ai ? ai.slice(3) : [...questionKind.more];
  const suggestedFor = ai
    ? custom.toLowerCase()
    : kind && kind.key !== "other"
      ? kind.label.toLowerCase()
      : "";
  const seeds: QuestionSeed[] = top.length
    ? questionSeeds(top, suggested, commonForLabel(kind?.key ?? null, custom))
    : suggested.map((question) => ({
        question,
        asked: null,
        items: [],
        unsure: 0,
        tag: suggestedFor ? `Suggested for ${suggestedFor}` : "Suggested",
      }));
  const answersForm = (
    <StepForm
      action={saveAnswersStep}
      submitLabel="Next"
      backHref="/setup?step=2"
      skipHref="/setup?step=4"
    >
      <QuestionsEditor seeds={seeds} more={moreQuestions} />
      <p className="text-ink-3 text-sm">
        Prices, complaints and anything you didn&apos;t write always come to you.
      </p>
    </StepForm>
  );
  const reading = step === 2 && !!progress && progress.phase !== "ready" && !more && !problem;
  const connected = new Set((accounts ?? []).map((a) => a.platform));
  const allowed = can(tenant.role, "brand.settings");

  if (!allowed) {
    return (
      <main className="mx-auto w-full max-w-[640px] px-4 py-10">
        <h1 className="page-title">Setting up {tenant.name}</h1>
        <p className="text-ink-2 mt-2">
          An owner or admin sets this up. <Link href="/today">Go to Today</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-7 px-4 py-8 md:py-12">
      {/* The end keeps the same frame (approved 17 Nov): stepper and step line stay. */}
      <Stepper step={step} steps={steps} />

      {/* Five steps fill the row, so help and the way out sit on the step line. Nothing here
          leaves setup by accident (approved 17 Nov): help opens in place, Finish later is the
          one way out, and Today's Get Waggle ready line keeps the place. */}
      <div className="text-ink-3 -mb-5 flex items-center justify-between gap-3 text-sm">
        <span>
          {step <= SETUP_LAST
            ? `Step ${step} of ${SETUP_LAST}`
            : `${steps.length - left.length} of ${SETUP_LAST} done`}
        </span>
        <span className="flex items-center gap-3">
          <HelpButton className="text-ink-3 hover:text-ink text-sm">Need help?</HelpButton>
          {(step <= SETUP_LAST || left.length > 0) && (
            <>
              <span aria-hidden>·</span>
              <Link href="/today" className="text-ink-3 hover:text-ink text-sm">
                Finish later
              </Link>
            </>
          )}
        </span>
      </div>

      {step === 1 && (
        <section className="flex flex-col gap-5">
          <div>
            <h1 className="page-title">Tell us about {tenant.name}</h1>
            <p className="text-ink-2 mt-1">
              Two lines is enough. This helps Waggle tell a question from someone ready to buy.
            </p>
          </div>
          <StepForm
            action={saveBusinessStep}
            submitLabel="Next"
            backHref={null}
            skipHref="/setup?step=2"
          >
            <KindPicker current={kind?.key ?? null} custom={custom} />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              What you do, in your words
              <textarea
                name="description"
                rows={3}
                required
                defaultValue={description}
                placeholder="We're a family café in Cebu. Coffee, pastries and lunch, dine-in and pickup."
                className="field font-normal"
              />
            </label>
          </StepForm>
        </section>
      )}

      {reading && progress && (
        <ReadingInbox
          initial={progress}
          next={{ href: "/setup?step=3", label: "Next: your top answers" }}
        />
      )}

      {step === 2 && !reading && (
        <section className="flex flex-col gap-5">
          <div>
            <h1 className="page-title">
              Connect Instagram or Facebook and we’ll show you who’s been waiting.
            </h1>
            <p className="text-ink-2 mt-1">
              Waggle reads your last 30 days. Nothing is posted or sent until you tap approve.
            </p>
          </div>
          {connecting && !connected.has(connecting) && !problem && (
            <p role="status" className="card p-4 text-sm">
              {platformLabel(connecting)} is connecting. It shows up here in a moment.{" "}
              <Link href="/setup?step=2" className="link-inline">
                Check again
              </Link>
            </p>
          )}
          {problem?.kind === "message" && (
            <p
              role="alert"
              className="border-danger-border bg-danger-soft text-danger rounded-xl border p-4 text-sm"
            >
              {problem.text}
            </p>
          )}
          {problem?.kind === "instagram-personal" ? (
            <div className="border-danger-border bg-danger-soft rounded-xl border p-5">
              <h2 className="section-title">This Instagram is a personal account</h2>
              <p className="text-ink-2 mt-1 text-sm">
                Instagram only lets apps read business inboxes. It takes about a minute to switch,
                and you keep your posts and followers:
              </p>
              <ol className="text-ink-2 mt-2 list-decimal space-y-1 pl-5 text-sm">
                <li>In Instagram, open Settings → Account type and tools.</li>
                <li>Tap Switch to professional account, then Business.</li>
                <li>Come back here and tap Connect again.</li>
              </ol>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <form action={connectAccount}>
                  <input type="hidden" name="platform" value="instagram" />
                  <input type="hidden" name="back" value="setup" />
                  <Button type="submit" variant="primary">
                    Connect again
                  </Button>
                </form>
                {!connected.has("facebook") && (
                  <form action={connectAccount}>
                    <input type="hidden" name="platform" value="facebook" />
                    <input type="hidden" name="back" value="setup" />
                    <Button type="submit" variant="secondary">
                      Connect Facebook instead
                    </Button>
                  </form>
                )}
              </div>
            </div>
          ) : (
            <ConnectGate inApp={connected.size ? null : inApp}>
              {onFree && connected.size === 0 && (
                <div>
                  <h2 className="section-title">Pick the one where most customers message you</h2>
                  <p className="text-ink-2 text-sm">
                    Free connects 1 account. Solo connects 3, so you can add the other later.
                  </p>
                </div>
              )}
              <ul className="card divide-line flex flex-col divide-y">
                {FIRST_ACCOUNTS.map((a) => (
                  <li key={a.platform} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <PlatformMark platform={a.platform} size={32} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <b className="font-semibold">{platformLabel(a.platform)}</b>
                      <span className="text-ink-3 text-sm">{a.does}</span>
                    </span>
                    {connected.has(a.platform) ? (
                      <span className="text-success flex items-center gap-1.5 text-sm font-semibold">
                        <Check className="size-4" strokeWidth={2.2} aria-hidden /> Connected
                      </span>
                    ) : (
                      <form action={connectAccount}>
                        <input type="hidden" name="platform" value={a.platform} />
                        <input type="hidden" name="back" value="setup" />
                        <Button type="submit" variant="secondary">
                          Connect
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              {more ? (
                <>
                  <ul className="card divide-line flex flex-col divide-y">
                    {MORE_ACCOUNTS.filter((id) => statusOf(statuses, id) === "available").map(
                      (id) => (
                        <li key={id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                          <PlatformMark platform={id} size={32} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <b className="font-semibold">{PLATFORMS[id].label}</b>
                            <span className="text-ink-3 text-sm">{PLATFORMS[id].line}</span>
                          </span>
                          {connected.has(id) ? (
                            <span className="text-success flex items-center gap-1.5 text-sm font-semibold">
                              <Check className="size-4" strokeWidth={2.2} aria-hidden /> Connected
                            </span>
                          ) : (
                            <form action={connectAccount}>
                              <input type="hidden" name="platform" value={id} />
                              <input type="hidden" name="back" value="setup" />
                              <Button
                                type="submit"
                                variant="secondary"
                                aria-label={`Connect ${PLATFORMS[id].label}`}
                              >
                                Connect
                              </Button>
                            </form>
                          )}
                        </li>
                      ),
                    )}
                  </ul>
                  {LATER_ACCOUNTS.length > 0 && (
                    <p className="text-ink-3 text-sm">
                      {LATER_ACCOUNTS.map((id) => PLATFORMS[id].label).join(", ")} need a few more
                      details, so they&apos;re in Settings → Connected accounts once setup is done.
                    </p>
                  )}
                  <Link href="/setup?step=2" scroll={false} className="action-link self-start">
                    Show fewer
                  </Link>
                </>
              ) : (
                <Link
                  href="/setup?step=2&more=1"
                  scroll={false}
                  className="action-link with-arrow self-start"
                >
                  More: TikTok, YouTube, LinkedIn and others
                </Link>
              )}
            </ConnectGate>
          )}
          <div className="flex items-center justify-between gap-3">
            <Link href="/setup?step=1" className="text-ink-2 hover:text-ink text-sm font-medium">
              Back
            </Link>
            {connected.size ? (
              <Link href="/setup?step=3" className={buttonVariants({ variant: "primary" })}>
                Next
              </Link>
            ) : (
              <Link href="/setup?step=3" className="action-link">
                Skip for now
              </Link>
            )}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-5">
          <Suspense fallback={null}>
            <TopQuestionsNotice />
          </Suspense>
          {top.length || waitingForTop ? (
            <div>
              <h1 className="page-title">Answer what your customers ask most</h1>
              <p className="text-ink-2 mt-1">
                From your own comments and messages this month. Waggle replies only with what you
                write here.
              </p>
            </div>
          ) : (
            <div>
              <h1 className="page-title">Answer the 3 questions you get most</h1>
              <p className="text-ink-2 mt-1">
                Waggle only says what you write. Change any question to one your customers really
                ask.
              </p>
            </div>
          )}
          {waitingForTop ? (
            <TopQuestionsWait skip={<SkipLink to={4} />}>{answersForm}</TopQuestionsWait>
          ) : (
            answersForm
          )}
        </section>
      )}

      {step === 4 && (
        <section className="flex flex-col gap-5">
          <div>
            <h1 className="page-title">Try {PRACTICE_GOAL} messages</h1>
            <p className="text-ink-2 mt-1">
              Type what a customer might say and watch Waggle answer from what you wrote. Nothing
              gets posted.
            </p>
          </div>
          {waitingForTop && <PracticeWait />}
          <Suspense fallback={<div className="skeleton h-72 rounded-xl" />}>
            <TryIt
              goal={{ done: triesDone, of: PRACTICE_GOAL }}
              examples={top.length ? top.map((q) => q.question) : undefined}
            />
          </Suspense>
          <div className="flex items-center justify-between gap-3">
            <Link href="/setup?step=3" className="text-ink-2 hover:text-ink text-sm font-medium">
              Back
            </Link>
            {tries?.done ? (
              <Link href="/setup?step=5" className={buttonVariants({ variant: "primary" })}>
                Next
              </Link>
            ) : (
              <SkipLink to={5} />
            )}
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="flex flex-col gap-5">
          <div>
            <h1 className="page-title">How should replies go out?</h1>
            <p className="text-ink-2 mt-1">
              You can change this any time. Most owners start with Ask me first.
            </p>
          </div>
          <StepForm
            action={saveRepliesStep}
            submitLabel="Finish"
            backHref="/setup?step=4"
            skipHref="/setup?step=6"
          >
            <fieldset className="flex flex-col gap-3">
              <legend className="sr-only">How replies go out</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    mode: "approve",
                    title: "Ask me first",
                    desc: "Waggle writes the reply and waits by the Send button for your OK. One tap to send.",
                    bee: <BeeBySend />,
                  },
                  {
                    mode: "auto",
                    title: "Reply on its own",
                    desc: "When your answers cover the question, Waggle replies right away. Everything else still comes to you.",
                    bee: <BeeOnItsOwn />,
                  },
                ].map((m) => {
                  const locked = m.mode === "auto" && !autoOk;
                  return (
                    <label
                      key={m.mode}
                      className={
                        locked
                          ? "card flex flex-col gap-2 p-4"
                          : "card has-[:checked]:border-honey has-[:checked]:ring-honey flex cursor-pointer flex-col gap-2 p-4 has-[:checked]:ring-1"
                      }
                    >
                      {m.bee}
                      <span className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="mode"
                          value={m.mode}
                          disabled={locked}
                          defaultChecked={
                            (faq?.mode === "auto" && autoOk ? "auto" : "approve") === m.mode
                          }
                          className="mt-1"
                        />
                        <span className="flex flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <b className="font-semibold">{m.title}</b>
                            {locked && (
                              <span className="border-honey-border bg-honey-tint text-honey-text rounded-full border px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase">
                                Solo and up
                              </span>
                            )}
                          </span>
                          <span className="text-ink-2 text-sm">{m.desc}</span>
                          {locked && (
                            <Link href={upgradeHref("auto_reply")} className="action-link text-sm">
                              {upgradeLabel("auto_reply")}
                            </Link>
                          )}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </StepForm>
        </section>
      )}

      {step === 6 && (
        <section className="flex flex-col gap-5">
          {left.length === 0 && <BeeDance className="mx-auto" />}
          <div className={left.length === 0 ? "text-center" : undefined}>
            <h1 className="page-title">
              {left.length === 0
                ? "Waggle is ready"
                : left.length === 1
                  ? "Almost there: one step left"
                  : `Almost there: ${left.length} steps left`}
            </h1>
            <p className="text-ink-2 mt-1 text-[15px]">
              {left.length === 0
                ? doneLine({
                    accounts: [...connected].map(platformLabel),
                    answers: answers ?? 0,
                    replyOnItsOwn: faq?.mode === "auto",
                  })
                : left[0].key === "connect" && left.length === 1
                  ? "Connect where customers message you, and Waggle starts answering."
                  : "Finish these and Waggle starts answering. Each one takes a minute."}
            </p>
          </div>
          {left.length > 0 && (
            <ul className="card divide-line flex flex-col divide-y" aria-label="What Waggle knows">
              {steps.map((s) => (
                <li key={s.key} className="flex items-center gap-3 px-5 py-3.5">
                  <StateMark state={s.done ? "working" : "off"} size={15} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="font-semibold">{s.label}</b>
                    <span className="text-ink-3 text-sm">
                      {stepDetail(s.key, s.done, {
                        kind: custom || kind?.label || "",
                        description,
                        accounts: [...connected].map(platformLabel),
                        answers: answers ?? 0,
                        triesStatus: s.status,
                        replyOnItsOwn: faq?.mode === "auto",
                      })}
                    </span>
                  </span>
                  {!s.done && (
                    <Link
                      href={`/setup?step=${s.n}`}
                      className={buttonVariants({ variant: "secondary" })}
                    >
                      Do it now
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          {progress && (
            <Link
              href="/reveal"
              className={`${buttonVariants({ variant: left.length ? "secondary" : "primary" })} self-center`}
            >
              See what you’ve been missing
            </Link>
          )}
          {left.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href="/today" className="text-ink-2 hover:text-ink text-sm font-medium">
                Go to Today instead
              </Link>
              <Link
                href={`/setup?step=${left[0].n}`}
                className={buttonVariants({ variant: "primary" })}
              >
                {NEXT_ACTION[left[0].key]}
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href="/today"
                className={buttonVariants({ variant: progress ? "secondary" : "primary" })}
              >
                Go to Today
              </Link>
              <Link href="/teach" className={buttonVariants({ variant: "secondary" })}>
                Teach Waggle more
              </Link>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
