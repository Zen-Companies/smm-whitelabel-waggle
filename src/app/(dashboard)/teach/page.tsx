import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { TeachView } from "@/features/teach";

export const metadata = { title: "Teach Waggle" };

// Plain props type: the generated route types need `next typegen`.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function View({ searchParams }: Props) {
  const { replies } = await searchParams;
  return <TeachView replies={replies === "1"} />;
}

export default function TeachPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading words={LOADING_WORDS.teach} />}>
      <View {...props} />
    </Suspense>
  );
}
