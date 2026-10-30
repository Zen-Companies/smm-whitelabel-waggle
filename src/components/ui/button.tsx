import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

// Buttons (docs/design.md §4). Honey only for the primary action.
const buttonVariants = cva(
  "group/button inline-flex min-h-10 shrink-0 items-center justify-center gap-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-out outline-none select-none focus-visible:ring-3 focus-visible:ring-ink/10 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /** Honey, ink text: the one primary action. */
        primary:
          "rounded-md bg-honey px-4 font-semibold text-ink hover:bg-honey-hover disabled:opacity-60 data-[busy]:bg-honey/70 data-[busy]:opacity-100",
        /** White, 1px line-strong border, ink text. */
        secondary:
          "rounded-md border border-line-strong bg-surface px-3.5 text-ink hover:bg-subtle disabled:opacity-50",
        /** Text only. */
        quiet: "rounded-md px-3 text-ink-2 hover:bg-subtle hover:text-ink disabled:opacity-50",
        /** Lead actions: a quiet honey tint. */
        lead: "rounded-md border border-honey-border bg-honey-tint px-3.5 text-ink hover:bg-subtle disabled:opacity-50",
        /** Text only, danger color. */
        destructive: "rounded-md px-3 text-danger hover:bg-danger-soft disabled:opacity-50",
        // Older names, kept so existing screens map onto the system.
        default:
          "rounded-md bg-honey px-4 font-semibold text-ink hover:bg-honey-hover disabled:opacity-60",
        outline:
          "rounded-md border border-line-strong bg-surface px-3.5 text-ink hover:bg-subtle disabled:opacity-50",
        ghost: "rounded-md px-3 text-ink-2 hover:bg-subtle hover:text-ink disabled:opacity-50",
        link: "px-1 text-ink-2 underline underline-offset-4 hover:text-ink",
      },
      size: {
        default: "",
        sm: "",
        lg: "",
        icon: "size-10 rounded-md px-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "secondary",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
