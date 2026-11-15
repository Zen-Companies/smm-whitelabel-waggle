import { Suspense } from "react";
import { TeachView } from "@/features/teach";

export const metadata = { title: "Teach Waggle" };

export default function TeachPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1320px] px-4 py-9 md:px-6">
          <div className="skeleton h-[560px] rounded-xl" />
        </div>
      }
    >
      <TeachView />
    </Suspense>
  );
}
