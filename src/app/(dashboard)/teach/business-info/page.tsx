import { Suspense } from "react";
import { KbList } from "@/features/knowledge-base";
import { ReadyLine } from "@/features/setup";

export const metadata = { title: "Business info" };

export default function KnowledgeBasePage({ searchParams }: PageProps<"/teach/business-info">) {
  return (
    <main
      data-fit-screen
      className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8 xl:min-h-0 xl:flex-1"
    >
      <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
        <KbList searchParams={searchParams} top={<ReadyLine />} />
      </Suspense>
    </main>
  );
}
