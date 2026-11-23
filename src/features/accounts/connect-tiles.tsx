import { PlatformMark } from "@/components/app/platform-mark";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { hasSetupCard, PLATFORM_IDS, PLATFORMS, type Platform } from "@/lib/social/platforms";
import { ConnectButton } from "./connect-button";
import { StateLabel } from "@/components/app/state-mark";
import { statusOf, type PlatformStatus, type PlatformStatuses } from "@/features/platforms";

/**
 * Connected somewhere else (More connections, Settings → Phone or Messaging), so no tile: one
 * row per platform on the page (18 Nov).
 */
const NOT_TILES = new Set<string>([
  "imap",
  "google",
  "microsoft",
  "phone",
  "sms",
  "rcs",
  "imessage",
]);

/**
 * Where a tile's platform stands today: Zernio's sign-in, a form in Waggle (Bluesky), or later
 * (setup steps not built yet, or not available upstream).
 */
function availability(p: Platform, status: PlatformStatus): "connect" | "form" | "soon" {
  // Staff → Platforms (18 Nov): Coming soon wins; X connects by sign-in once Available.
  if (status === "soon") return "soon";
  // A card in Waggle first: Bluesky's password, Telegram's code, WhatsApp's "what to know".
  if (hasSetupCard(p.id)) return "form";
  if (p.connect === "oauth" || p.id === "twitter") return "connect";
  return "soon";
}

/** The tile's lines: what Waggle does there, honest about inbox waves not shipped yet. */
function lines(p: Platform): { line: string; note: string | null } {
  if (p.kind === "answers" && !p.inboxLive && p.post) {
    return { line: "Posting now. Answering messages comes in an update.", note: p.needs };
  }
  return { line: p.line, note: p.needs };
}

function Tile({ p, status }: { p: Platform; status: PlatformStatus }) {
  const { line, note } = lines(p);
  return (
    // Opening the note (18 Nov) widens the tile to the whole row.
    <li className="border-line bg-surface flex flex-wrap items-center gap-3.5 rounded-xl border px-4 py-3.5 has-[[data-connect-open]]:col-span-full">
      <PlatformMark platform={p.id} size={40} />
      <span className="flex min-w-[200px] flex-1 flex-col">
        <b className="font-semibold">{p.label}</b>
        <span className="text-ink-2 text-[13px]">{line}</span>
        {note && <span className="text-ink-3 text-xs">{note}</span>}
      </span>
      {availability(p, status) === "form" ? (
        <Link
          href={`/settings/accounts?setup=${p.id}#setup`}
          className={buttonVariants({ variant: "secondary" })}
          aria-label={`Connect ${p.label}`}
        >
          Connect
        </Link>
      ) : availability(p, status) === "connect" ? (
        <ConnectButton
          id={p.id}
          label={p.label}
          mark={<PlatformMark platform={p.id} size={40} />}
        />
      ) : (
        <StateLabel state="soon" className="text-xs">
          Coming soon
        </StateLabel>
      )}
    </li>
  );
}

function Group({
  id,
  title,
  hint,
  platforms,
  statuses,
}: {
  id: string;
  title: string;
  hint?: string;
  platforms: Platform[];
  statuses: PlatformStatuses;
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
          <Tile key={p.id} p={p} status={statusOf(statuses, p.id)} />
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
export function ConnectTiles({
  exclude = [],
  statuses,
}: {
  exclude?: string[];
  statuses: PlatformStatuses;
}) {
  // Staff → Platforms (18 Nov): Hidden platforms aren't shown at all.
  const all = PLATFORM_IDS.map((id) => PLATFORMS[id]).filter(
    (p) => !NOT_TILES.has(p.id) && !exclude.includes(p.id) && statusOf(statuses, p.id) !== "hidden",
  );
  const at = (p: Platform) => availability(p, statusOf(statuses, p.id));
  const ready = all.filter((p) => at(p) !== "soon");
  const soon = all.filter((p) => at(p) === "soon");
  return (
    <div className="flex flex-col gap-6">
      <Group
        id="tiles-answers"
        title="Waggle answers messages here"
        hint="Comments, DMs or reviews come into your inbox and Waggle drafts the replies. You can post here too."
        platforms={ready.filter((p) => p.kind === "answers")}
        statuses={statuses}
      />
      <Group
        id="tiles-posts"
        title="Posting only"
        hint="These platforms don't let apps read messages, so Waggle posts for you but can't answer."
        platforms={ready.filter((p) => p.kind === "posts")}
        statuses={statuses}
      />
      <Group id="tiles-soon" title="Coming soon" platforms={soon} statuses={statuses} />
    </div>
  );
}
