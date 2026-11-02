import { Suspense } from "react";
import { LandingPage, SignedInRedirect } from "@/features/landing";

export const metadata = {
  title: { absolute: "Waggle · AI that runs your socials" },
  description:
    "Waggle posts for you, answers every comment and DM from your own business info, and tells you which customers are ready to buy.",
};

// The landing page is static; the signed-in check streams in and sends owners to the inbox.
export default function Home() {
  return (
    <>
      <Suspense fallback={null}>
        <SignedInRedirect />
      </Suspense>
      <LandingPage />
    </>
  );
}
