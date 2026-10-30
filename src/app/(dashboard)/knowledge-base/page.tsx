import { Suspense } from "react";
import { KbList } from "@/features/knowledge-base";

export const metadata = { title: "Business info" };

export default function KnowledgeBasePage({ searchParams }: PageProps<"/knowledge-base">) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
        <KbList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
