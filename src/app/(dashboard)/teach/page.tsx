import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { TeachView } from "@/features/teach";

export const metadata = { title: "Teach Waggle" };

// Plain props type: the generated route types need `next typegen`.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function View({ searchParams }: Props) {
  const { replies, on } = await searchParams;
  // `on`: the kind Worker Bee was just switched on for, after paying (Playbook round 2).
  const justOn = on === "faq" || on === "lead" ? on : undefined;
  return <TeachView replies={replies === "1"} justOn={justOn} />;
}

export default function TeachPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading words={LOADING_WORDS.teach} />}>
      <View {...props} />
    </Suspense>
  );
}
