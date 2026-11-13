import { Suspense } from "react";
import { ContactsView } from "@/features/contacts";

export const metadata = { title: "Contacts" };

// Plain props type: the generated route types need `next typegen`.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function View({ searchParams }: Props) {
  const p = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const page = Math.max(0, Math.min(200, Number(one(p.page) ?? 0) || 0));
  return <ContactsView q={one(p.q)} tag={one(p.tag)} page={page} />;
}

export default function ContactsPage(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-6 md:px-8">
      <Suspense fallback={<div className="skeleton h-[480px] rounded-xl" />}>
        <View {...props} />
      </Suspense>
    </main>
  );
}
