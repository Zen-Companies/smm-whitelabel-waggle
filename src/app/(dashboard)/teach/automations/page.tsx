import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { AutomationsView } from "@/features/automations";
import { ReadyLine } from "@/features/setup";

export const metadata = { title: "Automations" };

// Plain props type: the generated route types need `next typegen`.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function View({ searchParams }: Props) {
  // `followups=on`: after paying for follow-ups (Playbook round 2), the card opens switched on.
  const { followups } = await searchParams;
  return <AutomationsView top={<ReadyLine />} followupsOn={followups === "on"} />;
}

/** Teach Waggle → Automations, on its first kind (Comment to DM). */
export default function AutomationsPage({ searchParams }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-6 md:px-8">
      <Suspense fallback={<PageLoading words={LOADING_WORDS.teach} />}>
        <View searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
