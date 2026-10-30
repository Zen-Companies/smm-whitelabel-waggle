import Image from "next/image";
import { cn } from "cn";

export type Illustration = "inbox-clear" | "connect-accounts" | "new-lead" | "reconnect";

// Every panel is hive-raised (design.md §7); the old tint names are kept for callers.
const TINT = {
  lavender: "bg-hive-raised",
  coral: "bg-hive-raised",
  gray: "bg-hive-raised",
} as const;

/**
 * A bee spot illustration on a hive-raised panel (22px) with an Outfit 700 headline and one
 * friendly line (docs/design.md §7). Only for empty states, first runs, first wins and gentle
 * problems; never in lists, forms or complaint screens.
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
        "border-line flex flex-col items-center gap-3 rounded-2xl border px-6 py-10 text-center",
        TINT[tint],
        className,
      )}
    >
      <Image src={`/illustrations/${illustration}.svg`} alt="" width={224} height={160} priority />
      <h2 className="display-title">{title}</h2>
      {children && <p className="text-wax-muted max-w-md">{children}</p>}
      {action}
    </div>
  );
}
