import Link from "next/link";
import { Button } from "@/components/ui/button";
import { platformLabel } from "@/lib/social/platforms";
import { connectAccount } from "./actions";

/** The two most brands start with; every other platform is on Settings → Accounts. */
const FIRST_PLATFORMS = ["instagram", "facebook"] as const;

function Step({ n, done, children }: { n: number; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="border-line flex items-start gap-3.5 px-5 py-[18px] not-first:border-t">
      <span
        aria-hidden
        className={
          done
            ? "bg-ink text-surface inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
            : "border-line-strong text-ink-2 inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold"
        }
      >
        {n}
      </span>
      <span className="flex flex-1 flex-col gap-2.5">{children}</span>
    </li>
  );
}

/**
 * A brand with nothing connected yet (T47, design v3 "Brands"): connect its accounts, then fill in
 * Business info. Also the first run of a brand-new owner.
 */
export function BrandSetup({ brandName }: { brandName: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-7 py-6 md:py-10">
      <div className="flex flex-col gap-2">
        <h1 className="page-title">Set up {brandName}</h1>
        <p className="text-ink-2 text-[15px]">
          Two steps and Waggle starts answering for this brand.
        </p>
      </div>
      <ol className="border-line flex flex-col rounded-xl border">
        <Step n={1} done>
          <span className="flex flex-col gap-0.5">
            <b className="text-[15px] font-semibold">Connect its accounts</b>
            <span className="text-ink-2">
              Log in as {brandName}, not as one of your other brands.
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {FIRST_PLATFORMS.map((platform, i) => (
              <form key={platform} action={connectAccount}>
                <input type="hidden" name="platform" value={platform} />
                <Button type="submit" variant={i === 0 ? "primary" : "secondary"}>
                  Connect {platformLabel(platform)}
                </Button>
              </form>
            ))}
            <Link href="/settings?section=accounts" className="text-sm font-medium">
              TikTok, Google, YouTube and more
            </Link>
          </span>
        </Step>
        <Step n={2}>
          <span className="flex flex-col gap-0.5">
            <b className="text-[15px] font-semibold">Tell Waggle about the shop</b>
            <span className="text-ink-2">
              Hours, prices, delivery, how to order. Waggle only answers from what you write here.
            </span>
            <Link href="/knowledge-base" className="mt-1.5 font-medium">
              Fill in Business info
            </Link>
          </span>
        </Step>
      </ol>
      <p className="text-ink-3 text-sm">
        Until an account is connected, nothing comes in and nothing is sent for this brand. You can
        switch brands any time from the brand menu.
      </p>
    </div>
  );
}
