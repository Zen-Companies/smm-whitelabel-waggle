import { Suspense } from "react";
import { AccountBanner } from "@/features/accounts";
import { Bell } from "@/features/alerts";
import { AppHeader } from "@/features/tenants";

// App shell (docs/design.md §8): the top bar, then content centered up to ~1240px with 32px
// gutters (16 on phones). Each page sets its own width inside.
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense fallback={<div className="border-line h-14 border-b" />}>
        <AppHeader bell={<Bell />} />
      </Suspense>
      <Suspense fallback={null}>
        <div className="mx-auto w-full max-w-[1240px] px-4 pt-4 empty:hidden md:px-8 md:pt-6">
          <AccountBanner />
        </div>
      </Suspense>
      {children}
    </div>
  );
}
