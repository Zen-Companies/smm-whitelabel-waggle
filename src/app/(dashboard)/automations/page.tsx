import { Suspense } from "react";
import { AutomationsView } from "@/features/automations";

export const metadata = { title: "Automations" };

// Plain props type: the generated route types need `next typegen`.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function View({ searchParams }: Props) {
  const { kind } = await searchParams;
  return <AutomationsView kind={typeof kind === "string" ? kind : undefined} />;
}

export default function AutomationsPage(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-6 md:px-8">
      <Suspense fallback={<div className="skeleton h-[480px] rounded-xl" />}>
        <View {...props} />
      </Suspense>
    </main>
  );
}
