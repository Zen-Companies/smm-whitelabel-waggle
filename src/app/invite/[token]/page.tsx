import { Suspense } from "react";
import { Brand } from "@/components/app/brand";
import { InviteView } from "@/features/orgs";

export const metadata = { title: "Invite" };

async function View({ params, searchParams }: PageProps<"/invite/[token]">) {
  const [{ token }, { declined }] = await Promise.all([params, searchParams]);
  return <InviteView token={token} declined={declined === "1"} />;
}

// T56: the link in an invite email. Works signed in or out; the page decides what to offer.
export default function InvitePage(props: PageProps<"/invite/[token]">) {
  return (
    <main className="bg-page flex min-h-dvh flex-col items-center gap-8 px-4 py-10 md:py-14">
      <Brand />
      <div className="w-full max-w-[480px]">
        <Suspense fallback={<div className="skeleton h-72 rounded-xl" />}>
          <View {...props} />
        </Suspense>
      </div>
    </main>
  );
}
