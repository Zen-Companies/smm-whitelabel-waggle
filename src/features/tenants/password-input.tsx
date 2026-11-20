"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

/** A password field with an eye button to show what was typed (hotfix 21 Nov). */
export function PasswordInput(props: Omit<React.ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className="pr-11" />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="text-ink-3 hover:text-ink absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center"
      >
        {shown ? (
          <EyeOff className="size-[18px]" strokeWidth={1.5} aria-hidden />
        ) : (
          <Eye className="size-[18px]" strokeWidth={1.5} aria-hidden />
        )}
      </button>
    </div>
  );
}
