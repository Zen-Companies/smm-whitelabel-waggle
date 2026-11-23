import { AuthSplit } from "@/features/auth";
import { parseRefCode, RefCatcher } from "@/features/billing";
import { AuthForm } from "@/features/tenants";
export const metadata = { title: "Create your account" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  // A friend's link (give a month, get a month, 23 Nov): app.gowaggle.ai/signup?ref=<code>.
  const ref = parseRefCode((await searchParams).ref);
  return (
    <AuthSplit kind="signup">
      <div className="flex w-full max-w-[420px] flex-col">
        {ref && <RefCatcher code={ref} />}
        <AuthForm mode="signup" />
      </div>
    </AuthSplit>
  );
}
