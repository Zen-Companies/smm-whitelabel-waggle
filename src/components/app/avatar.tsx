import { User, Star } from "lucide-react";
import { cn } from "cn";
import { platformOf } from "@/lib/social/platforms";

/** The small platform mark on an avatar (design.md §1 rule 7): words stay out of the row. */
function PlatformMark({ platform }: { platform: string }) {
  const glyph =
    platform === "facebook" ? (
      <svg width="10" height="10" viewBox="0 0 24 24" className="fill-ink-2">
        <path d="M14 8h3V4h-3c-2.8 0-5 2.2-5 5v2H7v4h2v7h4v-7h3l1-4h-4V9c0-.6.4-1 1-1z" />
      </svg>
    ) : platform === "instagram" ? (
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2.4"
        className="stroke-ink-2"
      >
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    ) : (
      // Every other platform: its neutral letter mark (design v3 "Platforms": no logos).
      <span className="text-ink-2 text-[8px] leading-none font-bold">
        {(platformOf(platform)?.mark.text ?? "?").slice(0, 2)}
      </span>
    );
  return (
    <span
      aria-hidden
      className="bg-page absolute -right-[3px] -bottom-[3px] inline-flex size-4 items-center justify-center rounded-full"
    >
      {glyph}
    </span>
  );
}

/**
 * Customer avatar (docs/design.md §4): the platform's photo when we have one; otherwise a subtle
 * circle with a person icon. Never colored initials. `platform` adds the small platform mark.
 */
export function Avatar({
  src,
  size = 36,
  platform,
  icon = "person",
  className,
}: {
  src?: string | null;
  size?: number;
  platform?: string | null;
  /** "review" (T42): a star instead of the person, for a Facebook Page review. */
  icon?: "person" | "review";
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex h-fit shrink-0 self-start", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- platform CDN, any host
        <img src={src} alt="" width={size} height={size} className="rounded-full object-cover" />
      ) : (
        <span
          aria-hidden
          style={{ width: size, height: size }}
          className="bg-subtle text-ink-3 inline-flex items-center justify-center rounded-full"
        >
          {icon === "review" ? (
            <Star strokeWidth={1.5} className="size-[50%]" />
          ) : (
            <User strokeWidth={1.5} className="size-[50%]" />
          )}
        </span>
      )}
      {platform && <PlatformMark platform={platform} />}
    </span>
  );
}
