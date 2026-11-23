import { Suspense } from "react";
import { AuthSplit } from "@/features/auth";
import { parseRefCode, RefCatcher } from "@/features/billing";
import { AuthForm } from "@/features/tenants";
export const metadata = { title: "Create your account" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** A friend's link (give a month, get a month, 23 Nov): app.gowaggle.ai/signup?ref=<code>. */
async function FriendNote({ searchParams }: { searchParams: SearchParams }) {
  const ref = parseRefCode((await searchParams).ref);
  return ref ? <RefCatcher code={ref} /> : null;
}

export default function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <AuthSplit kind="signup">
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
