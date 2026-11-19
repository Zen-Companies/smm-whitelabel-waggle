import { Suspense } from "react";
import { RevealView } from "@/features/catch-up";

export const metadata = { title: "What you’ve been missing" };

/** First connect's reveal (board approved 20 Nov): from setup's end and Today's catch-up card. */
export default function RevealPage() {
  return (
    <Suspense
      fallback={<div className="skeleton mx-auto mt-12 h-96 w-full max-w-[760px] rounded-xl" />}
    >
      <RevealView />
    </Suspense>
  );
}
