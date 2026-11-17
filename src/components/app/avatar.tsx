import { Phone, Star, User } from "lucide-react";
import { cn } from "cn";
import { BrandMark } from "./platform-mark";

/**
 * The channel on an avatar (Inbox polish, approved 16 Nov): its own logo in colour, the same as
 * Connect an account, so the app reads before the name.
 */
function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span
      aria-hidden
      className="bg-surface absolute -right-1 -bottom-1 inline-flex rounded-[6px] p-px"
    >
      <BrandMark brand={platform} size={16} />
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
  icon?: "person" | "review" | "call";
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
          ) : icon === "call" ? (
            <Phone strokeWidth={1.5} className="size-[50%]" />
          ) : (
            <User strokeWidth={1.5} className="size-[50%]" />
          )}
        </span>
      )}
      {platform && <PlatformBadge platform={platform} />}
    </span>
  );
}
