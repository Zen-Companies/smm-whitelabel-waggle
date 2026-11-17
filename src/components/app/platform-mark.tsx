import { platformOf } from "@/lib/social/platforms";
import { brandLogo } from "./brand-logos";

/**
 * A brand's own logo, whole, on a small white tile (design.md §2). Decorative: the name is always
 * written next to it. Falls back to the platform's letter mark when Waggle has no logo file.
 */
export function BrandMark({ brand, size = 28 }: { brand: string; size?: number }) {
  const src = brandLogo(brand);
  if (!src) return <LetterMark platform={brand} size={size} />;
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center bg-white"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        padding: Math.max(2, Math.round(size * 0.14)),
        boxShadow: "inset 0 0 0 1px rgba(23,20,15,.10)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static logos, no optimisation needed */}
      <img src={src} alt="" className="block h-full w-full object-contain" />
    </span>
  );
}

/** A platform's logo (instagram, tiktok, googlebusiness…). */
export function PlatformMark({ platform, size = 28 }: { platform: string; size?: number }) {
  return <BrandMark brand={platform} size={size} />;
}

function LetterMark({ platform, size }: { platform: string; size: number }) {
  const mark = platformOf(platform)?.mark ?? { text: "?", bg: "#F4F1E9", fg: "#4F4A40" };
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: mark.bg,
        color: mark.fg,
        fontSize: Math.max(10, Math.round(size / 3)),
      }}
    >
      {mark.text}
    </span>
  );
}
