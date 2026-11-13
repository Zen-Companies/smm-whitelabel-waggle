"use client";

import { Menu } from "@base-ui/react/menu";
import { LogOut, Settings, Wrench } from "lucide-react";
import { ThemeChoice } from "./theme-choice";

const ITEM =
  "text-ink hover:bg-subtle data-[highlighted]:bg-subtle flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm outline-none";

/**
 * The account menu (design.md §4): Settings, Appearance, Staff tools (staff only), Log out.
 * Switching business stays in the brand menu next to the wordmark.
 */
export function AccountMenu({
  email,
  staffHref,
  signOut,
}: {
  email: string;
  /** The first staff page the user's role may open, or none. */
  staffHref: string | null;
  signOut: () => Promise<void>;
}) {
  const initial = email.trim().charAt(0).toUpperCase() || "?";
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Your account (${email})`}
        className="bg-ink text-honey hover:ring-line-strong data-[popup-open]:ring-line-strong inline-flex size-10 items-center justify-center rounded-full font-[family-name:var(--font-display)] text-sm font-bold ring-2 ring-transparent transition-shadow duration-150"
      >
        {initial}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={8} className="z-50">
          <Menu.Popup className="border-line bg-surface w-[300px] max-w-[calc(100vw-32px)] rounded-[18px] border p-2 shadow-[var(--shadow-overlay)] outline-none">
            <p className="text-ink-3 truncate px-3 pt-1.5 pb-2 text-xs">Signed in as {email}</p>
            <Menu.LinkItem href="/settings" className={ITEM}>
              <Settings className="text-ink-2 size-[18px]" strokeWidth={1.75} aria-hidden />
              Settings
            </Menu.LinkItem>
            <div className="px-3 pt-2 pb-2">
              <p className="text-ink-2 mb-1.5 text-xs font-medium">Appearance</p>
              <ThemeChoice className="flex w-full" />
            </div>
            {staffHref && (
              <>
                <Menu.Separator className="bg-line mx-1 my-1.5 h-px" />
                <Menu.LinkItem href={staffHref} className={ITEM}>
                  <Wrench className="text-ink-2 size-[18px]" strokeWidth={1.75} aria-hidden />
                  Staff tools
                  <span className="text-ink-3 ml-auto text-xs">Admins only</span>
                </Menu.LinkItem>
              </>
            )}
            <Menu.Separator className="bg-line mx-1 my-1.5 h-px" />
            <form action={signOut}>
              <button type="submit" className={`${ITEM} w-full`}>
                <LogOut className="text-ink-2 size-[18px]" strokeWidth={1.75} aria-hidden />
                Log out
              </button>
            </form>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
