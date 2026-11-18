import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { BetaCodesView } from "@/features/beta";

export const metadata = { title: "Beta codes" };

export default function Page() {
  return (
    <Suspense fallback={<PageLoading words={LOADING_WORDS.admin} />}>
      <BetaCodesView />
    </Suspense>
  );
}
