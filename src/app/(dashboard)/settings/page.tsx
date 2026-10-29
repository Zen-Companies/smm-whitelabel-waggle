import { Suspense } from "react";
import { AccountsCard } from "@/features/accounts";
import { NotificationSettings } from "@/features/alerts";
import { AutonomyCard } from "@/features/approvals";
import { BusinessSettings } from "@/features/tenants";

export const metadata = { title: "Settings" };

export default function SettingsPage({ searchParams }: PageProps<"/settings">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6 md:px-10 md:py-8">
      <h1 className="page-title">Settings</h1>
      <Suspense fallback={<div className="skeleton h-96 rounded-xl" />}>
        <AccountsCard searchParams={searchParams} />
        <AutonomyCard />
        <NotificationSettings />
        <BusinessSettings />
      </Suspense>
    </main>
  );
}
