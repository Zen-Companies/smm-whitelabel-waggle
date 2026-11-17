import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AutomationsView, isAutomationKind } from "@/features/automations";
import { ReadyLine } from "@/features/setup";

export const metadata = { title: "Automations" };

// Plain props type: the generated route types need `next typegen`.
type Props = { params: Promise<{ kind: string }> };

async function View({ params }: Props) {
  const { kind } = await params;
  if (!isAutomationKind(kind)) notFound();
  return <AutomationsView kind={kind} top={<ReadyLine />} />;
}

/** /teach/automations/<kind>: comment, flows, sequences or links. */
export default function AutomationKindPage(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-6 md:px-8">
      <Suspense fallback={<div className="skeleton h-[480px] rounded-xl" />}>
        <View {...props} />
      </Suspense>
    </main>
  );
}
