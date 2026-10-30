import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

// Buttons (docs/design.md §4). Minimum height 44px everywhere. Honey means "this matters".
const buttonVariants = cva(
  "group/button inline-flex min-h-11 shrink-0 items-center justify-center gap-2 text-[15px] font-medium whitespace-nowrap transition-colors duration-150 ease-out outline-none select-none focus-visible:ring-3 focus-visible:ring-honey/25 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /** Honey, hive text: the primary action. */
        primary:
          "rounded-md bg-honey px-5 font-semibold text-hive hover:bg-honey-light disabled:opacity-60 data-[busy]:bg-honey/60 data-[busy]:opacity-100",
        /** Transparent, 1px line-strong border, wax text. */
        secondary:
          "rounded-md border border-line-strong px-4 text-wax hover:bg-hive-high disabled:opacity-50",
        /** Text only, wax-muted. */
        quiet:
          "rounded-md px-3 text-wax-muted hover:bg-hive-high hover:text-wax disabled:opacity-50",
        /** Lead actions: honey-tinted. */
        lead: "rounded-md border border-banner-border bg-banner px-4 text-honey-light hover:bg-hive-high disabled:opacity-50",
        /** Text only, danger color. */
        destructive: "rounded-md px-3 text-danger hover:bg-danger-soft disabled:opacity-50",
        // Older names, kept so existing screens map onto the system.
        default:
          "rounded-md bg-honey px-5 font-semibold text-hive hover:bg-honey-light disabled:opacity-60",
        outline:
          "rounded-md border border-line-strong px-4 text-wax hover:bg-hive-high disabled:opacity-50",
        ghost:
          "rounded-md px-3 text-wax-muted hover:bg-hive-high hover:text-wax disabled:opacity-50",
        link: "px-1 text-wax-muted underline underline-offset-4 hover:text-honey-light",
      },
      size: {
        default: "",
        sm: "",
        lg: "",
        icon: "size-11 rounded-lg border border-line-strong bg-hive-raised px-0",
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
