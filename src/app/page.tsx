import { Suspense } from "react";
import { HomeRedirect } from "@/features/landing";

export const metadata = { title: { absolute: "Waggle" } };

// gowaggle.ai is the public site (18 Nov), so the app's own landing page is not shown: signed-in
// owners go to Today; signed-out visitors go to gowaggle.ai on production (permanent, from the
// proxy, 26 Nov) and to sign in elsewhere. The landing page code stays in features/landing.
export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeRedirect />
    </Suspense>
  );
}
