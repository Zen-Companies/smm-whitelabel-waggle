import { cn } from "cn";

const TONES = {
  grey: "bg-subtle text-ink-2",
  honey: "bg-honey-tint text-honey-text",
  red: "bg-danger-soft text-danger",
  green: "bg-success-soft text-success",
  blue: "bg-info-soft text-info",
} as const;

export type ChipTone = keyof typeof TONES;

/** A small rounded label (status, result, trait). Never color alone: the text says it. */
export function Chip({
  tone = "grey",
  className,
  children,
}: {
  tone?: ChipTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-[22px] items-center rounded-full px-2 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
