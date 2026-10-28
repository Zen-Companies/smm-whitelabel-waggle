import { Suspense } from "react";
import { BusinessSettings } from "@/features/tenants";

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <BusinessSettings />
      </Suspense>
    </main>
  );
}
