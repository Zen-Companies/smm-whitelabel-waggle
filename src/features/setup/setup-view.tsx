import { Check } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PlatformMark } from "@/components/app/platform-mark";
import { connectAccount } from "@/features/accounts";
import { TryIt } from "@/features/lab";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { platformLabel } from "@/lib/social/platforms";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "cn";
import { saveAnswersStep, saveBusinessStep, saveRepliesStep } from "./actions";
import { nextReadyStep, PRACTICE_GOAL, type ReadyStep } from "./checklist";
import { loadReadySteps } from "./ready-data";
import {
  BUSINESS_KINDS,
  doneLine,
  kindFromProfile,
  SETUP_LAST,
  type SetupStepNumber,
} from "./starter";
import { StepForm } from "./step-form";

const FIRST_ACCOUNTS = [
  { platform: "instagram", does: "Comments and DMs" },
  { platform: "facebook", does: "Comments, DMs and reviews" },
] as const;

function Stepper({ step, steps }: { step: SetupStepNumber; steps: ReadyStep[] }) {
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Setup steps">
      {steps.map((s) => {
        // Ticked by what's really done, so a skipped step stays open.
        const done = s.done && step !== s.n;
        const current = step === s.n;
        return (
          <li
            key={s.n}
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex items-center gap-2",
              current ? "text-ink font-semibold" : "text-ink-3",
            )}
          >
            <span
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                done
                  ? "bg-ink text-surface"
                  : current
                    ? "bg-honey text-ink"
                    : "border-line-strong border",
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={2.4} aria-hidden /> : s.n}
            </span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
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
}: {
  step: SetupStepNumber | null;
  connecting?: string;
}) {
  const tenant = await getCurrentTenant();
  const steps = await loadReadySteps(tenant.id);
  const step: SetupStepNumber = requested ?? nextReadyStep(steps)?.n ?? 6;
  const left = steps.filter((s) => !s.done);
  const tries = steps.find((s) => s.key === "practice");
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
      {step <= SETUP_LAST && <Stepper step={step} steps={steps} />}

      {/* Five steps fill the row, so "Need help?" sits on the step line. */}
      <div className="text-ink-3 -mb-5 flex items-center justify-between gap-3 text-sm">
        <span>{step <= SETUP_LAST ? `Step ${step} of ${SETUP_LAST}` : ""}</span>
        <Link href="/settings/account" className="text-ink-3 text-sm">
          Need help?
        </Link>
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
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">What kind of business?</legend>
              <div className="flex flex-wrap gap-2">
                {BUSINESS_KINDS.map((k) => (
                  <label
                    key={k.key}
                    className="border-line-strong has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-surface flex cursor-pointer items-center rounded-full border px-3.5 py-2 text-sm has-[:focus-visible]:ring-2"
                  >
                    <input
                      type="radio"
                      name="kind"
                      value={k.key}
                      defaultChecked={kind?.key === k.key}
                      required
                      className="sr-only"
                    />
                    {k.label}
                  </label>
                ))}
              </div>
            </fieldset>
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

      {step === 2 && (
        <section className="flex flex-col gap-5">
          <div>
            <h1 className="page-title">Where do customers message you?</h1>
            <p className="text-ink-2 mt-1">
              Connect at least one. Waggle reads new messages only, never your old ones, and never
              posts without you.
            </p>
          </div>
          {connecting && !connected.has(connecting) && (
            <p role="status" className="card p-4 text-sm">
              {platformLabel(connecting)} is connecting. It shows up here in a moment.{" "}
              <Link href="/setup?step=2" className="link-inline">
                Check again
              </Link>
            </p>
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
          <Link href="/settings/accounts" className="action-link with-arrow self-start">
            More: TikTok, WhatsApp, YouTube, LinkedIn and others
          </Link>
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
          <div>
            <h1 className="page-title">Answer the 3 questions you get most</h1>
            <p className="text-ink-2 mt-1">
              Waggle only says what you write. You can add more any time in Teach Waggle.
            </p>
          </div>
          <StepForm
            action={saveAnswersStep}
            submitLabel="Next"
            backHref="/setup?step=2"
            skipHref="/setup?step=4"
          >
            {(kind ?? BUSINESS_KINDS[BUSINESS_KINDS.length - 1]).questions.map((q, i) => (
              <label key={q} className="flex flex-col gap-1.5 text-sm font-medium">
                &ldquo;{q}&rdquo;
                <input type="hidden" name={`q${i}`} value={q} />
                <textarea
                  name={`a${i}`}
                  rows={2}
                  placeholder="Your answer, the way you'd say it"
                  className="field font-normal"
                />
              </label>
            ))}
            <p className="text-ink-3 text-sm">
              Prices, complaints and anything you didn&apos;t write always come to you.
            </p>
          </StepForm>
        </section>
      )}

      {step === 4 && (
        <section className="flex flex-col gap-5">
          <div>
            <h1 className="page-title">Try {PRACTICE_GOAL} messages</h1>
            <p className="text-ink-2 mt-1">
              Type what a customer might say and see what Waggle would do. Nothing gets posted.
              {tries && !tries.done && tries.status !== "Not yet" && ` ${tries.status} tried.`}
            </p>
          </div>
          <Suspense fallback={<div className="skeleton h-72 rounded-xl" />}>
            <TryIt />
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
              {[
                {
                  mode: "approve",
                  title: "Ask me first",
                  desc: "Waggle writes the reply and waits for your OK. One tap to send.",
                },
                {
                  mode: "auto",
                  title: "Reply on its own",
                  desc: "When your answers cover the question, Waggle replies right away. Everything else still comes to you.",
                },
              ].map((m) => (
                <label
                  key={m.mode}
                  className="card has-[:checked]:border-honey has-[:checked]:ring-honey flex cursor-pointer gap-3 p-4 has-[:checked]:ring-1"
                >
                  <input
                    type="radio"
                    name="mode"
                    value={m.mode}
                    defaultChecked={(faq?.mode === "auto" ? "auto" : "approve") === m.mode}
                    className="mt-1"
                  />
                  <span className="flex flex-col">
                    <b className="font-semibold">{m.title}</b>
                    <span className="text-ink-2 text-sm">{m.desc}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </StepForm>
        </section>
      )}

      {step === 6 && (
        <section className="flex flex-col gap-5">
          <h1 className="page-title">{left.length ? "Almost there" : "You’re set up"}</h1>
          <p className="text-ink-2 text-[15px]">
            {doneLine({
              accounts: [...connected].map(platformLabel),
              answers: answers ?? 0,
              replyOnItsOwn: faq?.mode === "auto",
            })}
          </p>
          {left.length > 0 && (
            <ul className="card divide-line flex flex-col divide-y">
              {left.map((s) => (
                <li key={s.key} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="min-w-0 flex-1 font-semibold">{s.label}</span>
                  <span className="text-ink-3 text-sm">{s.status}</span>
                  <Link href={`/setup?step=${s.n}`} className="action-link with-arrow text-sm">
                    Do it now
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href="/today" className={buttonVariants({ variant: "primary" })}>
              Go to Today
            </Link>
            <Link href="/teach" className={buttonVariants({ variant: "secondary" })}>
              Open Teach Waggle
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
