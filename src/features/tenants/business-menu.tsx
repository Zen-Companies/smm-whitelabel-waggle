"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, LogOut, Plus, Settings, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { ThemeChoice } from "@/components/app/theme-choice";
import { cn } from "cn";
import { switchOrg, type OrgSummary } from "@/features/orgs/client";
import { switchBrand } from "./brand-actions";
import { BrandAvatar, OrgAvatar } from "./brand-menu";
import type { BrandSummary } from "./brands";

const ITEM =
  "text-ink hover:bg-subtle data-[highlighted]:bg-subtle flex min-h-11 cursor-default items-center gap-3 rounded-[10px] px-3 text-sm outline-none";

function Status({ brand }: { brand: BrandSummary }) {
  if (brand.accounts.length === 0) {
    return <span className="text-honey-text text-xs whitespace-nowrap">Connect</span>;
  }
  if (brand.needsYou === 0) return null;
  return (
    <span className="text-honey-text inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
      <span aria-hidden className="bg-honey size-1.5 rounded-full" />
      {brand.needsYou} {brand.needsYou === 1 ? "needs" : "need"} you
    </span>
  );
}

/**
 * The account button (design.md §4, the redesign's header): the open business's initials and
 * name on the right. Its menu: who's signed in, the businesses to switch between (and other
 * organizations, when there are any), + Add another business, Settings, Appearance, Staff tools
 * (staff only) and Log out. Replaces the separate brand switcher by the wordmark.
 */
export function BusinessMenu({
  signedInAs,
  orgs,
  brands,
  currentId,
  currentOrgId,
  canAddBrand,
  staffHref,
  signOut,
  planRow,
}: {
  signedInAs: string;
  orgs: OrgSummary[];
  brands: BrandSummary[];
  currentId: string;
  currentOrgId: string;
  /** May add a business in the open organization (owners and admins). */
  canAddBrand: boolean;
  /** The first staff page the user's role may open, or none. */
  staffHref: string | null;
  signOut: () => Promise<void>;
  /** Your plan, on top of the menu (approved 18 Nov). */
  planRow?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const current = brands.find((b) => b.id === currentId) ?? brands[0];
  if (!current) return null;
  const inOrg = brands.filter((b) => b.organizationId === currentOrgId);
  const otherOrgs = orgs.filter((o) => o.id !== currentOrgId);
  const othersWaiting = brands.some((b) => b.id !== current.id && b.needsYou > 0);

  const openBrand = (tenantId: string) => {
    if (tenantId === current.id) return;
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("returnTo", pathname);
    startTransition(() => switchBrand(fd));
  };
  const openOrg = (orgId: string) => {
    const fd = new FormData();
    fd.set("orgId", orgId);
    fd.set("returnTo", pathname);
    startTransition(() => switchOrg(fd));
  };

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`${current.name}, your account${othersWaiting ? ". Another business needs you" : ""}`}
        disabled={pending}
        className="border-line hover:bg-subtle data-[popup-open]:bg-subtle inline-flex min-h-11 max-w-[16rem] items-center gap-2 rounded-xl border py-1 pr-3 pl-1.5 text-sm transition-colors duration-150 disabled:opacity-60"
      >
        <span className="relative inline-flex">
          <BrandAvatar brand={current} size={32} />
          {othersWaiting && (
            <span
              aria-hidden
              className="bg-honey ring-surface absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2"
            />
          )}
        </span>
        <span className="hidden truncate font-semibold sm:inline">{current.name}</span>
        <ChevronDown className="text-ink-2 hidden size-3.5 sm:inline" strokeWidth={2} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={8} className="z-50">
          <Menu.Popup className="border-line bg-surface w-[320px] max-w-[calc(100vw-32px)] rounded-[18px] border p-2 shadow-[var(--shadow-overlay)] outline-none">
            {planRow}
            <p className="text-ink-3 truncate px-3 pt-1.5 pb-2 text-xs">
              Signed in as {signedInAs}
            </p>

            <Menu.Group>
              <Menu.GroupLabel className="text-ink-3 px-3 pt-1 pb-1 text-xs font-medium">
                {otherOrgs.length
                  ? `Businesses in ${orgs.find((o) => o.id === currentOrgId)?.name ?? ""}`
                  : "Your businesses"}
              </Menu.GroupLabel>
              {inOrg.map((b) => (
                <Menu.Item
                  key={b.id}
                  onClick={() => openBrand(b.id)}
                  aria-current={b.id === current.id || undefined}
                  className={cn(ITEM, b.id === current.id && "bg-subtle")}
                >
                  <BrandAvatar brand={b} size={28} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{b.name}</span>
                  <Status brand={b} />
                  {b.id === current.id && <Check className="size-4" strokeWidth={2} aria-hidden />}
                </Menu.Item>
              ))}
              {canAddBrand && (
                <Menu.LinkItem
                  render={<Link href={`/brands/new?org=${currentOrgId}`} />}
                  className={cn(ITEM, "font-medium no-underline")}
                >
                  <span
                    aria-hidden
                    className="border-line-strong inline-flex size-7 items-center justify-center rounded-full border border-dashed"
                  >
                    <Plus className="text-ink-2 size-3.5" strokeWidth={2} />
                  </span>
                  Add another business
                </Menu.LinkItem>
              )}
            </Menu.Group>

            {otherOrgs.length > 0 && (
              <>
                <Menu.Separator className="bg-line mx-1 my-1.5 h-px" />
                <Menu.Group>
                  <Menu.GroupLabel className="text-ink-3 px-3 pt-1 pb-1 text-xs font-medium">
                    Other organizations
                  </Menu.GroupLabel>
                  {otherOrgs.map((o) => {
                    const waiting = brands.some((b) => b.organizationId === o.id && b.needsYou > 0);
                    return (
                      <Menu.Item key={o.id} onClick={() => openOrg(o.id)} className={ITEM}>
                        <OrgAvatar org={o} size={26} />
                        <span className="min-w-0 flex-1 truncate">{o.name}</span>
                        {waiting && (
                          <span aria-label="Needs you" className="bg-honey size-1.5 rounded-full" />
                        )}
                      </Menu.Item>
                    );
                  })}
                </Menu.Group>
              </>
            )}
            <Menu.LinkItem
              render={<Link href="/orgs/new" />}
              className={cn(ITEM, "text-ink-2 no-underline")}
            >
              <span
                aria-hidden
                className="border-line-strong inline-flex size-7 items-center justify-center rounded-md border border-dashed"
              >
                <Plus className="text-ink-2 size-3.5" strokeWidth={2} />
              </span>
              Create an organization
            </Menu.LinkItem>

            <Menu.Separator className="bg-line mx-1 my-1.5 h-px" />
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
