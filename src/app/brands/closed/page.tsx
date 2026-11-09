import { Suspense } from "react";
import { ClosedBrandView } from "@/features/tenants";

export const metadata = { title: "Brand closed" };

// T21: an owner's brand that our team offboarded. Outside the dashboard shell, which needs an
// open brand.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ClosedBrandView />
    </Suspense>
  );
}
