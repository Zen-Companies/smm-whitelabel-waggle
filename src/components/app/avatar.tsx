import { User } from "lucide-react";
import { cn } from "cn";

/**
 * Customer avatar (docs/design.md §3): the platform's photo when we have one; otherwise a
 * gray-50 circle with a person icon. Never colored initials.
 */
export function Avatar({
  src,
  size = 36,
  className,
}: {
  src?: string | null;
  size?: number;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- platform CDN, any host
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gray-50 text-gray-600",
        className,
      )}
    >
      <User strokeWidth={1.75} className="size-[55%]" />
    </span>
  );
}
