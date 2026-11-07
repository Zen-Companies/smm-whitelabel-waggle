import { Suspense } from "react";
import { StaffStrip } from "@/features/staff";

// Staff pages: the staff strip (role + tabs), then the page. Each page checks its own permission.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <Suspense fallback={<div className="border-line bg-subtle h-10 border-b" />}>
        <StaffStrip />
      </Suspense>
      {children}
    </>
  );
}
