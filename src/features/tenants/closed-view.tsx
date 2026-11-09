import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/app/brand";
import { Button, buttonVariants } from "@/components/ui/button";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { BRAND_COOKIE } from "./brand-pick";
import { closedBrandFor } from "./closed";

const date = (iso: string, year = false) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });

/** What an owner sees on a brand our team offboarded (T21, design v3). */
export async function ClosedBrandView() {
  const user = await getCurrentUser();
  const store = await cookies();
  const closed = await closedBrandFor(user.id, store.get(BRAND_COOKIE)?.value);
  if (!closed) redirect("/inbox");
  // Another brand of theirs that is still open (read through RLS: offboarded ones are hidden).
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("tenants")
    .select("id, name")
    .order("created_at")
    .order("id")
    .limit(1);
  const other = data?.[0];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-line flex min-h-14 flex-wrap items-center gap-x-6 gap-y-2 border-b px-4 md:px-8">
        <Brand />
        <span className="border-line rounded-md border px-2.5 py-1.5 text-[13px]">
          {closed.name}
        </span>
      </header>
      <main className="flex flex-1 justify-center px-4 pt-18 pb-12">
        <section aria-labelledby="closed-h" className="flex w-full max-w-[520px] flex-col gap-4">
          <h1 id="closed-h" className="page-title">
            {closed.name} is closed on Waggle
          </h1>
          <p className="text-ink-2">
            Waggle stopped replying and posting for this brand on {date(closed.offboardedAt)}, and
            its Instagram and Facebook were disconnected.
          </p>
          <p className="text-ink-2">
            Your business info, messages and posts are kept until{" "}
            <b className="text-ink font-semibold">{date(closed.purgeAfter, true)}</b>. To reopen the
            brand before then, email{" "}
            <a href="mailto:help@zencompaniesinc.com">help@zencompaniesinc.com</a>. After that date
            they are deleted for good.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-2">
            {other && (
              <Link
                href={`/brands/switch?to=${other.id}&next=/inbox`}
                prefetch={false}
                className={buttonVariants({ variant: "primary", className: "min-h-11" })}
              >
                Go to {other.name}
              </Link>
            )}
            <form action={signOut}>
              <Button type="submit" className="min-h-11">
                Sign out
              </Button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
