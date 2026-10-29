import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

// Buttons (docs/design.md §3). Minimum height 44px everywhere. One primary pill per screen.
const buttonVariants = cva(
  "group/button inline-flex min-h-11 shrink-0 items-center justify-center gap-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-out outline-none select-none focus-visible:ring-3 focus-visible:ring-focus-ring disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /** Violet pill: the one primary action on a screen. */
        primary:
          "rounded-full bg-violet px-6 font-semibold text-white hover:bg-violet-strong disabled:opacity-60 data-[busy]:bg-violet-busy data-[busy]:opacity-100",
        /** White, 1px gray-200 border, 12px radius. */
        secondary:
          "rounded-md border border-gray-200 bg-surface px-4 text-ink hover:bg-gray-50 disabled:opacity-50",
        /** Text only. */
        quiet: "rounded-md px-3 text-gray-700 hover:bg-gray-50 hover:text-ink disabled:opacity-50",
        /** Lead actions. */
        lead: "rounded-md border border-coral-border bg-coral-soft px-4 text-coral-text hover:bg-[#ffece7] disabled:opacity-50",
        /** Text only, danger color. */
        destructive: "rounded-md px-3 text-danger hover:bg-danger-soft disabled:opacity-50",
        // Older names, kept so existing screens map onto the system.
        default:
          "rounded-full bg-violet px-6 font-semibold text-white hover:bg-violet-strong disabled:opacity-60",
        outline:
          "rounded-md border border-gray-200 bg-surface px-4 text-ink hover:bg-gray-50 disabled:opacity-50",
        ghost: "rounded-md px-3 text-gray-700 hover:bg-gray-50 hover:text-ink disabled:opacity-50",
        link: "px-1 text-gray-700 underline underline-offset-4 hover:text-ink",
      },
      size: {
        default: "",
        sm: "",
        lg: "",
        icon: "size-11 px-0",
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
