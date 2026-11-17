import { Suspense } from "react";
import { Bee } from "@/components/app/bee";
import { Brand } from "@/components/app/brand";
import { AddPhotosView } from "@/features/mcp";

export const metadata = { title: "Add photos" };

// Plain props type: the generated route types need `next typegen`.
type Props = { params: Promise<{ id: string }> };

async function Body({ params }: Props) {
  const { id } = await params;
  return <AddPhotosView uploadId={id} />;
}

/** Opened from a link an AI assistant gave the owner (MCP create_upload_link). Phone first. */
export default function AddPhotosPage({ params }: Props) {
  return (
    <div className="bg-page flex min-h-dvh flex-col">
      <header className="border-line bg-surface border-b">
        <div className="mx-auto flex min-h-14 max-w-[560px] items-center px-4">
          <Brand />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-6">
        <Suspense
          fallback={
            <div className="flex min-h-[320px] items-center justify-center">
              <Bee scene="loading" />
            </div>
          }
        >
          <Body params={params} />
        </Suspense>
      </main>
    </div>
  );
}
