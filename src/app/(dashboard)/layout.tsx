import { Suspense } from "react";
import { AccountBanner } from "@/features/accounts";
import { AppSidebar } from "@/features/tenants";

// App shell (docs/design.md §8): white sidebar, main area on gray-25, 32–40px padding,
// content up to ~1200px. The sidebar stacks on top on phone widths.
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Suspense fallback={<div className="bg-surface border-b md:h-dvh md:w-56 md:border-r" />}>
        <AppSidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={null}>
          <div className="mx-auto w-full max-w-[1200px] px-4 pt-4 empty:hidden md:px-10 md:pt-8">
            <AccountBanner />
          </div>
        </Suspense>
        {children}
      </div>
    </div>
  );
}
