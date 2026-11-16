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
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1320px] px-4 py-9 md:px-6">
          <div className="skeleton h-[560px] rounded-xl" />
        </div>
      }
    >
      <View {...props} />
    </Suspense>
  );
}
