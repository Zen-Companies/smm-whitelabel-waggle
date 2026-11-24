import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import Link from "next/link";
import { Suspense } from "react";
import { PromotionEditView } from "@/features/billing";

export const metadata = { title: "Promotion" };

// Plain props type: the generated route types need `next typegen`.
type Props = { params: Promise<{ id: string }> };

async function View({ params }: Props) {
  const { id } = await params;
  return <PromotionEditView id={id} />;
}

export default function Page(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <Link href="/admin/promotions" className="text-ink-2 hover:text-ink text-sm">
          ← Promotions
        </Link>
        <h1 className="page-title">Edit promotion</h1>
      </div>
      <Suspense fallback={<PageLoading words={LOADING_WORDS.admin} />}>
        <View {...props} />
      </Suspense>
    </main>
  );
}
