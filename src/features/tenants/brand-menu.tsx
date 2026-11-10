"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "cn";
import { initialsOf, switchOrg, type OrgSummary } from "@/features/orgs/client";
import { switchBrand } from "./brand-actions";
import type { BRAND_TINTS } from "./brand-pick";
import type { BrandSummary } from "./brands";

const TINT: Record<(typeof BRAND_TINTS)[number], string> = {
  honey: "bg-honey-tint text-honey-text",
  leaf: "bg-success-soft text-success",
  stone: "bg-subtle text-ink-2",
};

const ROLE: Record<OrgSummary["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

/** A brand's avatar (T57): its picture, else its initials, on a circle (brands are circles). */
export function BrandAvatar({ brand, size = 32 }: { brand: BrandSummary; size?: 26 | 28 | 32 }) {
  const dim =
    size === 32 ? "size-8 text-xs" : size === 28 ? "size-7 text-[11px]" : "size-[26px] text-[11px]";
  if (brand.pictureUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- our own storage, 512 px squares
      <img
        src={brand.pictureUrl}
        alt=""
        className={cn("shrink-0 rounded-full object-cover", dim)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold",
        dim,
        TINT[brand.tint],
      )}
    >
      {brand.initials}
    </span>
  );
}

/** An organization's avatar (T57): its picture, else initials, on a rounded square. */
export function OrgAvatar({ org, size = 32 }: { org: OrgSummary; size?: 26 | 32 }) {
  const dim = size === 26 ? "size-[26px] rounded-[6px] text-[11px]" : "size-8 rounded-md text-xs";
  if (org.pictureUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- our own storage, 512 px squares
      <img src={org.pictureUrl} alt="" className={cn("shrink-0 object-cover", dim)} />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "bg-subtle text-ink-2 inline-flex shrink-0 items-center justify-center font-bold",
        dim,
      )}
    >
      {initialsOf(org.name)}
    </span>
  );
}

function BrandStatus({ brand }: { brand: BrandSummary }) {
  if (brand.accounts.length === 0) {
    return <span className="text-honey-text text-xs whitespace-nowrap">Connect</span>;
  }
  if (brand.needsYou === 0) {
    return <span className="text-ink-4 text-xs whitespace-nowrap">All caught up</span>;
  }
  return (
    <span className="text-honey-text inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
      <span aria-hidden className="bg-honey size-1.5 rounded-full" />
      {brand.needsYou} {brand.needsYou === 1 ? "needs" : "need"} you
    </span>
  );
}

function orgLine(org: OrgSummary, seen: number, total: number): string {
  const brands =
    total === 0
      ? "no brands yet"
      : org.allBrands
        ? `${total} ${total === 1 ? "brand" : "brands"}`
        : `${seen} of ${total} brands`;
  return `${ROLE[org.role]} · ${brands}`;
}

const ITEM =
  "data-[highlighted]:bg-subtle flex min-h-11 cursor-default items-center gap-2.5 rounded-lg p-2.5 outline-none";

/**
 * The switcher next to the logo (T54, design v3 "Organizations", OrgSwitcher): it reads
 * "Organization / Brand". Left column: the user's organizations with their role; picking one
 * fills the right column with the brands the user can see there. Picking a brand reopens the
 * same section for it; an organization with none of the user's brands opens on "Add your first
 * brand". One organization with one brand: the button shows just the brand.
 */
export function BrandMenu({
  orgs,
  brands,
  brandCounts,
  currentId,
  currentOrgId,
  canAddBrandIn,
}: {
  orgs: OrgSummary[];
  brands: BrandSummary[];
  /** Brands in each organization, the ones the user can't see included ("1 of 2 brands"). */
  brandCounts: Record<string, number>;
  currentId: string;
  currentOrgId: string;
  /** Organizations where the user may add a brand (owners and admins). */
  canAddBrandIn: string[];
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [viewed, setViewed] = useState(currentOrgId);
  const current = brands.find((b) => b.id === currentId) ?? brands[0];
  const currentOrg = orgs.find((o) => o.id === currentOrgId);
  if (!current) return null;
  const othersWaiting = brands.some((b) => b.id !== current.id && b.needsYou > 0);
  const simple = orgs.length <= 1 && brands.length <= 1;
  const viewedOrg = orgs.find((o) => o.id === viewed) ?? currentOrg;
  const viewedBrands = brands.filter((b) => b.organizationId === viewedOrg?.id);

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

  const label = `${currentOrg && !simple ? `${currentOrg.name} / ` : ""}${current.name}${
    othersWaiting ? ". Another brand needs you" : ""
  }`;

  return (
    <Menu.Root onOpenChange={(open) => open && setViewed(currentOrgId)}>
      <Menu.Trigger
        aria-label={`Organization and brand: ${label}`}
        disabled={pending}
        className="border-line-strong bg-surface hover:bg-subtle data-[popup-open]:bg-subtle inline-flex min-h-10 max-w-[22rem] items-center gap-2 rounded-md border py-1 pr-2.5 pl-1.5 text-sm transition-colors duration-150 disabled:opacity-60"
      >
        {currentOrg && !simple && <OrgAvatar org={currentOrg} size={26} />}
        {(!currentOrg || simple) && <BrandAvatar brand={current} size={26} />}
        {currentOrg && !simple && (
          <>
            <span className="text-ink-3 hidden max-w-36 truncate sm:inline">{currentOrg.name}</span>
            <span aria-hidden className="text-line-strong hidden sm:inline">
              /
            </span>
          </>
        )}
        {currentOrg && !simple && <BrandAvatar brand={current} size={26} />}
        <span className="truncate font-semibold">{current.name}</span>
        <span className="relative inline-flex">
          <ChevronDown className="text-ink-2 size-3.5" strokeWidth={2} aria-hidden />
          {othersWaiting && (
            <span
              aria-hidden
              className="bg-honey absolute -top-1 -right-1.5 size-1.5 rounded-full"
            />
          )}
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="start" sideOffset={6} className="z-50">
          <Menu.Popup className="border-line bg-surface grid w-[640px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border shadow-[0_12px_32px_rgba(24,24,27,0.10),0_2px_6px_rgba(24,24,27,0.06)] outline-none sm:grid-cols-2">
            <div className="border-line flex flex-col border-b p-1.5 sm:border-r sm:border-b-0">
              <Menu.Group>
                <Menu.GroupLabel className="text-ink-4 px-2.5 pt-2 pb-1.5 text-xs">
                  Organizations
                </Menu.GroupLabel>
                {orgs.map((org) => {
                  const seen = brands.filter((b) => b.organizationId === org.id).length;
                  const isViewed = org.id === viewedOrg?.id;
                  return (
                    <Menu.Item
                      key={org.id}
                      closeOnClick={false}
                      onClick={() => setViewed(org.id)}
                      aria-current={org.id === currentOrgId || undefined}
                      className={cn(ITEM, isViewed && "bg-subtle")}
                    >
                      <OrgAvatar org={org} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-semibold">{org.name}</span>
                        <span className="text-ink-3 truncate text-xs">
                          {orgLine(org, seen, brandCounts[org.id] ?? seen)}
                        </span>
                      </span>
                      <span className="inline-flex w-4 justify-center">
                        {org.id === currentOrgId && (
                          <Check className="size-4" strokeWidth={2} aria-hidden />
                        )}
                      </span>
                    </Menu.Item>
                  );
                })}
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
            </div>

            <div className="bg-page/60 flex flex-col p-1.5">
              <Menu.Group>
                <Menu.GroupLabel className="text-ink-4 truncate px-2.5 pt-2 pb-1.5 text-xs">
                  Brands in {viewedOrg?.name}
                </Menu.GroupLabel>
                {viewedBrands.length === 0 ? (
                  <Menu.Item
                    onClick={() => viewedOrg && openOrg(viewedOrg.id)}
                    className={cn(ITEM, "flex-col items-start gap-0.5")}
                  >
                    <span className="font-semibold">No brands yet</span>
                    <span className="text-ink-3 text-xs">
                      Open {viewedOrg?.name} to add its first brand.
                    </span>
                  </Menu.Item>
                ) : (
                  viewedBrands.map((brand) => {
                    const isCurrent = brand.id === current.id;
                    return (
                      <Menu.Item
                        key={brand.id}
                        onClick={() => openBrand(brand.id)}
                        aria-current={isCurrent || undefined}
                        className={cn(ITEM, isCurrent && "bg-subtle")}
                      >
                        <BrandAvatar brand={brand} size={28} />
                        <span className="min-w-0 flex-1 truncate font-semibold">{brand.name}</span>
                        <BrandStatus brand={brand} />
                        <span className="inline-flex w-4 justify-center">
                          {isCurrent && <Check className="size-4" strokeWidth={2} aria-hidden />}
                        </span>
                      </Menu.Item>
                    );
                  })
                )}
              </Menu.Group>
              {viewedOrg && canAddBrandIn.includes(viewedOrg.id) && (
                <>
                  <Menu.Separator className="bg-line mx-1 my-1.5 h-px" />
                  <Menu.LinkItem
                    render={<Link href={`/brands/new?org=${viewedOrg.id}`} />}
                    className={cn(ITEM, "text-ink font-medium no-underline")}
                  >
                    <span
                      aria-hidden
                      className="border-line-strong inline-flex size-7 items-center justify-center rounded-md border border-dashed"
                    >
                      <Plus className="text-ink-2 size-3.5" strokeWidth={2} />
                    </span>
                    Add a brand
                  </Menu.LinkItem>
                </>
              )}
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
