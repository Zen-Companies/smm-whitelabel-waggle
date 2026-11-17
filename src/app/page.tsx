import { Suspense } from "react";
import { HomeRedirect } from "@/features/landing";

export const metadata = {
  title: { absolute: "Waggle · AI that runs your socials" },
  description:
    "Waggle posts for you, answers every comment and DM from your own business info, and tells you which customers are ready to buy.",
};

// gowaggle.ai is the public site (18 Nov), so the app's own landing page is not shown: signed-in
// owners go to Today and everyone else to sign in. The landing page code stays in
// features/landing for later.
export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeRedirect />
    </Suspense>
  );
}
