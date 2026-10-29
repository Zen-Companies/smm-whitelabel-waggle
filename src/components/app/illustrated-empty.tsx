import Image from "next/image";
import { cn } from "cn";

export type Illustration = "inbox-clear" | "connect-accounts" | "new-lead" | "reconnect";

const TINT = {
  lavender: "bg-lavender",
  coral: "bg-coral-soft",
  gray: "bg-gray-50",
} as const;

/**
 * Spot illustration on a soft tinted panel with a Bricolage headline and one friendly line
 * (docs/design.md §6). Only for empty states, first runs, first wins and gentle problems.
 */
export function IllustratedEmpty({
  illustration,
  title,
  children,
  tint = "lavender",
  action,
  className,
}: {
  illustration: Illustration;
  title: string;
  children?: React.ReactNode;
  tint?: keyof typeof TINT;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl px-6 py-10 text-center",
        TINT[tint],
        className,
      )}
    >
      <Image src={`/illustrations/${illustration}.svg`} alt="" width={224} height={160} priority />
      <h2 className="display-title">{title}</h2>
      {children && <p className="max-w-md text-gray-700">{children}</p>}
      {action}
    </div>
  );
}
