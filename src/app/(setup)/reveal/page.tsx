import { redirect } from "next/navigation";

/**
 * "What you've been missing" is now setup's step 2 (Walter's flow, 20 Nov): old links (Today's
 * catch-up card before, emails) open its first screen.
 */
export default function RevealPage() {
  redirect("/setup?screen=missed");
}
