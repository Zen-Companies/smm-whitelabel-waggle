import { Suspense } from "react";
import { AccountBanner } from "@/features/accounts";
import { Bell } from "@/features/alerts";
import { AppSidebar } from "@/features/tenants";

// App shell (docs/design.md §8): white sidebar, main area on gray-25, 32–40px padding,
// content left-aligned up to ~1440px (design v2). The sidebar stacks on top on phone widths.
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Suspense fallback={<div className="bg-hive-raised border-b md:h-dvh md:w-56 md:border-r" />}>
        <AppSidebar bell={<Bell />} />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={null}>
          <div className="w-full max-w-[1440px] px-4 pt-4 empty:hidden md:px-8 md:pt-6">
            <AccountBanner />
          </div>
        </Suspense>
        {children}
      </div>
    </div>
  );
}
