import Link from "next/link";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button, buttonVariants } from "@/components/ui/button";
import { connectAccount } from "./actions";

/**
 * Settings → Accounts → Connect WhatsApp (design v3 "Platforms · Setup steps", T67): what to know
 * first, then Meta's own sign-up through Zernio.
 */
export function WhatsAppSetup() {
  return (
    <section
      id="setup"
      aria-labelledby="whatsapp-setup"
      className="border-line bg-surface flex max-w-xl flex-col gap-3.5 rounded-2xl border p-5"
    >
      <div className="flex items-center gap-3">
        <PlatformMark platform="whatsapp" size={40} />
        <h3 id="whatsapp-setup" className="text-[17px] font-semibold">
          Connect WhatsApp
        </h3>
      </div>
      <p className="text-ink-2">
        You&apos;ll sign in with Meta to pick your Business account and phone number.
      </p>
      <ul className="text-ink-2 flex list-disc flex-col gap-1 pl-5">
        <li>Keep using the WhatsApp Business app on your phone: messages show in both.</li>
        <li>
          Waggle answers within 24 hours of the customer&apos;s last message. After that, WhatsApp
          only allows an approved template, and the message comes to you.
        </li>
        <li>Meta may charge for template messages.</li>
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <form action={connectAccount}>
          <input type="hidden" name="platform" value="whatsapp" />
          <Button type="submit" variant="primary">
            Continue with Meta
          </Button>
        </form>
        <Link href="/settings?section=accounts" className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
      </div>
    </section>
  );
}
