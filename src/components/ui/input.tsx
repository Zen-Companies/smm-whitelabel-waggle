import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";

/** 44px input, 12px radius; focus = violet border + 3px ring (docs/design.md §3). */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive type={type} data-slot="input" className={cn("field", className)} {...props} />
  );
}

export { Input };
