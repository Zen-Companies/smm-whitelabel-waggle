import { PlatformMark } from "@/components/app/platform-mark";
import { LineKeysForm } from "./email-line-forms";

/** Settings → Accounts → Connect LINE, opened in place from its tile (T81a). */
export function LineSetup() {
  return (
    <section
      id="setup"
      aria-labelledby="line-setup"
      className="border-line bg-surface flex max-w-xl flex-col gap-3.5 rounded-2xl border p-5"
    >
      <div className="flex items-center gap-3">
        <PlatformMark platform="line" size={40} />
        <h3 id="line-setup" className="text-[17px] font-semibold">
          Connect LINE
        </h3>
      </div>
      <p className="text-ink-2 text-sm">
        Waggle answers chats with your LINE Official Account. Replies within a minute of the
        customer&apos;s message are free; later ones count toward your LINE plan&apos;s messages.
        Group chats aren&apos;t supported.
      </p>
      <LineKeysForm />
    </section>
  );
}
