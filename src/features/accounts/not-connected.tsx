import Link from "next/link";
import { EmptySpot } from "@/components/app/empty-spot";
import { buttonVariants } from "@/components/ui/button";

/**
 * A brand with no account connected, on a page that needs one (Inbox, Posts, Contacts, Insights;
 * 20 Nov, replaces the old "Set up <brand>" card). One line and one button into setup's Connect
 * step, so the first connect gets "Reading your inbox…" and the reveal. People who can't connect
 * accounts are told who can.
 */
export function NotConnectedYet({
  brandName,
  canConnect,
}: {
  brandName: string;
  canConnect: boolean;
}) {
  return (
    <section aria-label="No account connected" className="card w-full p-5">
      <EmptySpot
        action={
          canConnect ? (
            <Link href="/setup?step=2" className={buttonVariants({ variant: "primary" })}>
              Connect an account
            </Link>
          ) : undefined
        }
      >
        {brandName} isn&rsquo;t connected yet.{" "}
        {canConnect
          ? "Connect Instagram or Facebook and Waggle shows you who’s been waiting."
          : "An Owner or Admin connects its Instagram or Facebook, then messages show up here."}
      </EmptySpot>
    </section>
  );
}
