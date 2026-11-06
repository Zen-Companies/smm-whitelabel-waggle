import Link from "next/link";
import { Mark, Wordmark } from "../components/brand";

export const metadata = { title: "Log in · Waggle", robots: { index: false, follow: false } };

// Prototype entry only: there are no accounts here and nothing asks for a password.
export default function Page() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-12">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <Mark size={96} bee />
        <Wordmark className="mt-3 text-3xl" />
        <h1 className="mt-8 text-[1.75rem] leading-tight font-semibold tracking-[-0.02em]">Back to your socials.</h1>
        <p className="mt-2 text-[15px] text-soft">This is a clickable prototype with sample data for a pretend café. No account or password needed.</p>
        <Link href="/today" className="mt-6 inline-flex h-14 w-full items-center justify-center rounded-full bg-honey px-8 text-lg font-semibold text-hive transition hover:bg-honey-glow">
          Open the prototype
        </Link>
        <Link href="/" className="mt-2 inline-flex min-h-11 items-center text-[15px] font-medium text-soft transition hover:text-ink">
          Back to the homepage
        </Link>
      </div>
    </main>
  );
}
