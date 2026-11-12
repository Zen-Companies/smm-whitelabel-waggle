import { platformOf } from "@/lib/social/platforms";

/**
 * A platform's neutral letter mark (design v3 "Platforms": no platform logos). Decorative: the
 * platform's name is always written next to it.
 */
export function PlatformMark({ platform, size = 28 }: { platform: string; size?: number }) {
  const mark = platformOf(platform)?.mark ?? { text: "?", bg: "#F4F4F5", fg: "#52525B" };
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 4),
        background: mark.bg,
        color: mark.fg,
        fontSize: Math.max(10, Math.round(size / 3)),
      }}
    >
      {mark.text}
    </span>
  );
}
