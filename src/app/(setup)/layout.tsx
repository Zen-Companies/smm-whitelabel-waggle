import { LogOut } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Brand } from "@/components/app/brand";
import { listMyOrgs, OrgMenu } from "@/features/orgs";
import { getOpenOrg, signOut } from "@/features/tenants";

async function Switcher() {
  const [orgs, open] = await Promise.all([listMyOrgs(), getOpenOrg()]);
  return <OrgMenu orgs={orgs} currentId={open?.id ?? null} />;
}

// Pages with no brand open (T54, design v3 "Organizations", OrgSignup): the wordmark, the
// organization switcher and sign out. No brand nav: there's no brand yet.
export default function SetupLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-page flex min-h-dvh flex-col">
      <header className="border-line bg-surface border-b">
        <div className="mx-auto flex min-h-14 max-w-[1240px] items-center gap-4 px-4 md:px-8">
          <Link href="/welcome" className="flex min-h-14 items-center" aria-label="Waggle">
            <Brand />
          </Link>
          <Suspense fallback={<div className="skeleton h-10 w-48 rounded-md" />}>
            <Switcher />
          </Suspense>
          <form action={signOut} className="ml-auto">
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="text-ink-2 hover:bg-subtle hover:text-ink inline-flex size-10 items-center justify-center rounded-md transition-colors duration-150"
            >
              <LogOut strokeWidth={1.5} className="size-[18px]" aria-hidden />
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
