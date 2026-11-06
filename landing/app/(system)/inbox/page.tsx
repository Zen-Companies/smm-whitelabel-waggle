import { Suspense } from "react";
import { InboxView } from "./view";

export const metadata = { title: "Inbox · Waggle" };

export default function Page() {
  return (
    <Suspense>
      <InboxView />
    </Suspense>
  );
}
