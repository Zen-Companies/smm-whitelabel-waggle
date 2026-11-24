import { Suspense } from "react";
import { AuthSplit } from "@/features/auth";
import { InviteCard, InvitePanel, parseRefCode, RefCatcher } from "@/features/billing";
import { AuthForm } from "@/features/tenants";
export const metadata = { title: "Create your account" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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

export default function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <AuthSplit
      kind="signup"
      aside={
        <Suspense fallback={null}>
          <FriendPanel searchParams={searchParams} />
        </Suspense>
      }
    >
      <div className="flex w-full max-w-[420px] flex-col">
        {/* Read at request time; the form itself stays prerendered. */}
        <Suspense fallback={null}>
          <FriendNote searchParams={searchParams} />
        </Suspense>
        <AuthForm mode="signup" />
      </div>
    </AuthSplit>
  );
}
