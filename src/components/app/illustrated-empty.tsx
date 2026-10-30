import { Bee, type BeeScene } from "@/components/app/bee";
import { cn } from "cn";

export type Illustration = "inbox-clear" | "connect-accounts" | "new-lead" | "reconnect";

// Each empty state shows one of the bee's moments (docs/design.md §6).
const SCENE: Record<Illustration, BeeScene> = {
  "inbox-clear": "caught-up",
  "new-lead": "caught-up",
  "connect-accounts": "loading",
  reconnect: "resting",
};

/**
 * Empty states, first runs and gentle problems (docs/design.md §6): the bee, a short headline and
 * one friendly line, on the page itself (no box, rule 1). `tint` is kept for callers; Paper has
 * one look.
 */
export function IllustratedEmpty({
  illustration,
  title,
  children,
  action,
  className,
}: {
  illustration: Illustration;
  title: string;
  children?: React.ReactNode;
  tint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <Bee scene={SCENE[illustration]} />
      <h2 className="display-title">{title}</h2>
      {children && <p className="text-ink-2 max-w-md">{children}</p>}
      {action}
    </div>
  );
}
