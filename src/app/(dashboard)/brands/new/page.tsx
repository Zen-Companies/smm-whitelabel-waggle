import Link from "next/link";
import { Suspense } from "react";
import { AddBrandForm, getCurrentTenant } from "@/features/tenants";

export const metadata = { title: "Add a brand" };

async function Intro() {
  const tenant = await getCurrentTenant();
  return (
    <div className="flex flex-col gap-2">
      <Link href="/inbox" className="text-ink-2 hover:text-ink text-sm no-underline">
        ← Back to {tenant.name}
      </Link>
      <h1 className="page-title">Add a brand</h1>
      <p className="text-ink-2 text-[15px]">
        A brand is one business. It gets its own Instagram and Facebook accounts, Business info,
        inbox and reply rules. Nothing is shared with {tenant.name}.
      </p>
    </div>
  );
}

// T47 (design v3 "Brands"): one login, several businesses.
export default function AddBrandPage() {
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-7 px-4 py-10 md:py-14">
      <Suspense fallback={<div className="skeleton h-24 rounded-xl" />}>
        <Intro />
      </Suspense>
      <AddBrandForm />
    </main>
  );
}
