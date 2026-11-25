import { redirect } from "next/navigation";
import { cache, Suspense } from "react";
import { AuthSplit, AuthWall } from "@/features/auth";
import {
  InviteCard,
  InvitePanel,
  loadSignupPlan,
  parseRefCode,
  RefCatcher,
  SignupPlanPanel,
  SignupPlanStrip,
  type SignupPlanCard,
  type SignupPlanLinks,
} from "@/features/billing";
import { AuthForm } from "@/features/tenants";
import { parseStartParam, signupPlanHref, startCheckoutPath } from "@/lib/checkout-link";
import { createServerSupabase } from "@/lib/supabase/server";
export const metadata = { title: "Create your account" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The plan picked on gowaggle.ai (board "From the site's plan card to that plan in the app",
 * option A, 25 Nov): /signup?plan=solo or plan=team. Solo or Team on sale only; anything else is
 * today's page. Someone already signed in goes to Your plan's checkout link for it.
 */
const pickedPlan = cache(
  async (
    searchParams: SearchParams,
  ): Promise<{ card: SignupPlanCard; links: SignupPlanLinks } | null> => {
    const params = await searchParams;
    const card = await loadSignupPlan(parseStartParam(params.plan));
    if (!card) return null;
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getUser();
    if (data.user) redirect(startCheckoutPath(card.start));
    return {
      card,
      links: {
        switchHref: card.other ? signupPlanHref(params, card.other.start) : null,
        freeHref: signupPlanHref(params, null),
      },
    };
  },
);

/**
 * A friend's link (give a month, get a month, 23 Nov): app.gowaggle.ai/signup?ref=<code>. The
 * invite card names the business that sent it (approved 24 Nov); an unknown code shows nothing.
 */
async function FriendNote({ searchParams }: { searchParams: SearchParams }) {
  const ref = parseRefCode((await searchParams).ref);
  if (!ref) return null;
  return (
    <>
      <RefCatcher code={ref} />
      <InviteCard code={ref} />
    </>
  );
}

/** The dark panel on the left, for invited visitors (computers only: phones get the card). */
async function FriendPanel({ searchParams }: { searchParams: SearchParams }) {
  const ref = parseRefCode((await searchParams).ref);
  return ref ? <InvitePanel code={ref} /> : null;
}

/** The left side: the picked plan (a friend's invite above it), else the moving wall. */
async function Wall({ searchParams }: { searchParams: SearchParams }) {
  const picked = await pickedPlan(searchParams);
  if (!picked) return <AuthWall kind="signup" />;
  return (
    <SignupPlanPanel {...picked}>
      <FriendPanel searchParams={searchParams} />
    </SignupPlanPanel>
  );
}

/** Over the moving wall: a friend's invite (with a plan, the plan panel holds it instead). */
async function WallAside({ searchParams }: { searchParams: SearchParams }) {
  if (await pickedPlan(searchParams)) return null;
  return <FriendPanel searchParams={searchParams} />;
}

/** The form; with a plan, the phone's plan strip above it and the free-month button. */
async function SignupForm({ searchParams }: { searchParams: SearchParams }) {
  const picked = await pickedPlan(searchParams);
  if (!picked) return <AuthForm mode="signup" />;
  return (
    <>
      <SignupPlanStrip {...picked} />
      <AuthForm mode="signup" plan={picked.card.start} />
    </>
  );
}

export default function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <AuthSplit
      kind="signup"
      wall={
        <Suspense fallback={<AuthWall kind="signup" />}>
          <Wall searchParams={searchParams} />
        </Suspense>
      }
      aside={
        <Suspense fallback={null}>
          <WallAside searchParams={searchParams} />
        </Suspense>
      }
    >
      <div className="flex w-full max-w-[420px] flex-col">
        {/* Read at request time; the plain form is the prerendered stand-in until then. */}
        <Suspense fallback={null}>
          <FriendNote searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<AuthForm mode="signup" />}>
          <SignupForm searchParams={searchParams} />
        </Suspense>
      </div>
    </AuthSplit>
  );
}
