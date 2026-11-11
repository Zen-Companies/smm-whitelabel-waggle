import { Suspense } from "react";
import { BetaCodesView } from "@/features/beta";

export const metadata = { title: "Beta codes" };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton mx-auto my-6 h-96 w-full max-w-[1240px]" />}>
      <BetaCodesView />
    </Suspense>
  );
}
