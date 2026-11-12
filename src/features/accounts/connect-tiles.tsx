import { PlatformMark } from "@/components/app/platform-mark";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { PLATFORM_IDS, PLATFORMS, type Platform } from "@/lib/social/platforms";
import { connectAccount } from "./actions";

/**
 * Where a tile's platform stands today: Zernio's sign-in, a form in Waggle (Bluesky), or later
 * (setup steps not built yet, or not available upstream).
 */
function availability(p: Platform): "connect" | "form" | "soon" {
  if (p.connect === "oauth") return "connect";
  if (p.connect === "password" || p.connect === "code") return "form";
  return "soon";
}

/** The tile's lines: what Waggle does there, honest about inbox waves not shipped yet. */
function lines(p: Platform): { line: string; note: string | null } {
  if (p.kind === "answers" && !p.inboxLive && p.post) {
    return { line: "Posting now. Answering messages comes in an update.", note: p.needs };
  }
  return { line: p.line, note: p.needs };
}

function Tile({ p }: { p: Platform }) {
  const { line, note } = lines(p);
  return (
    <li className="border-line bg-surface flex items-center gap-3.5 rounded-xl border px-4 py-3.5">
      <PlatformMark platform={p.id} size={40} />
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="font-semibold">{p.label}</b>
        <span className="text-ink-2 text-[13px]">{line}</span>
        {note && <span className="text-ink-3 text-xs">{note}</span>}
      </span>
      {availability(p) === "form" ? (
        <Link
          href={`/settings?section=accounts&setup=${p.id}#setup`}
          className={buttonVariants({ variant: "secondary" })}
          aria-label={`Connect ${p.label}`}
        >
          Connect
        </Link>
      ) : availability(p) === "connect" ? (
        <form action={connectAccount}>
          <input type="hidden" name="platform" value={p.id} />
          <Button type="submit" variant="secondary" aria-label={`Connect ${p.label}`}>
            Connect
          </Button>
        </form>
      ) : (
        <span className="bg-subtle text-ink-2 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">
          Coming soon
        </span>
      )}
    </li>
  );
}

function Group({
  id,
  title,
  hint,
  platforms,
}: {
  id: string;
  title: string;
  hint?: string;
  platforms: Platform[];
}) {
  if (!platforms.length) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5">
      <div className="flex flex-col">
        <h3 id={id} className="text-[15px] font-semibold">
          {title}
        </h3>
        {hint && <span className="text-ink-3 text-[13px]">{hint}</span>}
      </div>
      <ul className="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-3">
        {platforms.map((p) => (
          <Tile key={p.id} p={p} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Every Zernio platform as a tile (design v3 "Platforms · Connect accounts"), grouped: Waggle
 * answers messages here / posting only / coming soon. Bluesky and Telegram open their setup card
 * in place; WhatsApp and Discord show as coming soon until theirs are built.
 */
export function ConnectTiles({ exclude = [] }: { exclude?: string[] }) {
  const all = PLATFORM_IDS.map((id) => PLATFORMS[id]).filter((p) => !exclude.includes(p.id));
  const ready = all.filter((p) => availability(p) !== "soon");
  const soon = all.filter((p) => availability(p) === "soon");
  return (
    <div className="flex flex-col gap-6">
      <Group
        id="tiles-answers"
        title="Waggle answers messages here"
        hint="Comments, DMs or reviews come into your inbox and Waggle drafts the replies. You can post here too."
        platforms={ready.filter((p) => p.kind === "answers")}
      />
      <Group
        id="tiles-posts"
        title="Posting only"
        hint="These platforms don't let apps read messages, so Waggle posts for you but can't answer."
        platforms={ready.filter((p) => p.kind === "posts")}
      />
      <Group id="tiles-soon" title="Coming soon" platforms={soon} />
    </div>
  );
}
