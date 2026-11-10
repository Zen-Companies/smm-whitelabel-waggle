"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { cn } from "cn";
import { ROLE_LABEL } from "./abilities";
import { switchOrg } from "./actions";
import { initialsOf } from "./copy";
import type { OrgSummary } from "./org-pick";

const ITEM =
  "data-[highlighted]:bg-subtle flex min-h-11 cursor-default items-center gap-2.5 rounded-lg p-2.5 outline-none";

function Avatar({ name, size }: { name: string; size: 26 | 32 }) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-subtle text-ink-2 inline-flex shrink-0 items-center justify-center font-bold",
        size === 26 ? "size-[26px] rounded-[6px] text-[11px]" : "size-8 rounded-md text-xs",
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * The organization switcher on pages with no brand open (/welcome, /orgs/new): the user's
 * organizations and "Create an organization" (design v3 "Organizations", OrgSignup).
 */
export function OrgMenu({ orgs, currentId }: { orgs: OrgSummary[]; currentId: string | null }) {
  const [pending, startTransition] = useTransition();
  const current = orgs.find((o) => o.id === currentId) ?? orgs[0];
  if (!current) return null;
  const open = (orgId: string) => {
    if (orgId === current.id) return;
    const fd = new FormData();
    fd.set("orgId", orgId);
    fd.set("returnTo", "/inbox");
    startTransition(() => switchOrg(fd));
  };
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Organization: ${current.name}`}
        disabled={pending}
        className="border-line-strong bg-surface hover:bg-subtle data-[popup-open]:bg-subtle inline-flex min-h-10 max-w-72 items-center gap-2 rounded-md border py-1 pr-2.5 pl-1.5 text-sm transition-colors duration-150 disabled:opacity-60"
      >
        <Avatar name={current.name} size={26} />
        <span className="truncate font-semibold">{current.name}</span>
        <ChevronDown className="text-ink-2 size-3.5" strokeWidth={2} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="start" sideOffset={6} className="z-50">
          <Menu.Popup className="border-line bg-surface w-[320px] max-w-[calc(100vw-32px)] rounded-xl border p-1.5 shadow-[0_12px_32px_rgba(24,24,27,0.10),0_2px_6px_rgba(24,24,27,0.06)] outline-none">
            <Menu.Group>
              <Menu.GroupLabel className="text-ink-4 px-2.5 pt-2 pb-1.5 text-xs">
                Organizations
              </Menu.GroupLabel>
              {orgs.map((org) => (
                <Menu.Item
                  key={org.id}
                  onClick={() => open(org.id)}
                  aria-current={org.id === current.id || undefined}
                  className={cn(ITEM, org.id === current.id && "bg-subtle")}
                >
                  <Avatar name={org.name} size={32} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{org.name}</span>
                    <span className="text-ink-3 text-xs">{ROLE_LABEL[org.role]}</span>
                  </span>
                  <span className="inline-flex w-4 justify-center">
                    {org.id === current.id && (
                      <Check className="size-4" strokeWidth={2} aria-hidden />
                    )}
                  </span>
                </Menu.Item>
              ))}
            </Menu.Group>
            <Menu.Separator className="bg-line mx-1 my-1.5 h-px" />
            <Menu.LinkItem
              render={<Link href="/orgs/new" />}
              className={cn(ITEM, "text-ink font-medium no-underline")}
            >
              <span
                aria-hidden
                className="border-line-strong inline-flex size-8 items-center justify-center rounded-md border border-dashed"
              >
                <Plus className="text-ink-2 size-3.5" strokeWidth={2} />
              </span>
              Create an organization
            </Menu.LinkItem>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
