import { cn } from "cn";

/**
 * An on/off switch (design v3 "Switches"): ink when on, line-strong when off. A real button, so it
 * can submit a form; `label` names what it turns on.
 */
export function Switch({
  on,
  label,
  className,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "role" | "aria-checked"> & {
  on: boolean;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={cn(
        "focus-visible:ring-ink/10 relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 outline-none focus-visible:ring-3 disabled:opacity-60",
        on ? "bg-ink" : "bg-line-strong",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "bg-surface absolute top-0.5 size-5 rounded-full transition-[left] duration-150",
          on ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  );
}
