"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { cn } from "cn";
import { switchBrand } from "./brand-actions";
import type { BRAND_TINTS } from "./brand-pick";
import type { BrandSummary } from "./brands";

const TINT: Record<(typeof BRAND_TINTS)[number], string> = {
  honey: "bg-honey-tint text-honey-text",
  leaf: "bg-success-soft text-success",
  stone: "bg-subtle text-ink-2",
};

/** A brand's avatar: its initials on a tinted square (design v3 "Brands"). */
export function BrandAvatar({ brand, size = 32 }: { brand: BrandSummary; size?: 26 | 32 }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-bold",
        size === 26 ? "size-[26px] rounded-[6px] text-[11px]" : "size-8 rounded-md text-xs",
        TINT[brand.tint],
      )}
    >
      {brand.initials}
    </span>
  );
}

function PlatformIcon({ platform }: { platform: string }) {
  return platform === "facebook" ? (
    <svg width="11" height="11" viewBox="0 0 24 24" className="fill-ink-3" aria-hidden>
      <path d="M14 8h3V4h-3c-2.8 0-5 2.2-5 5v2H7v4h2v7h4v-7h3l1-4h-4V9c0-.6.4-1 1-1z" />
    </svg>
  ) : (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2.2"
      className="stroke-ink-3"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
    </svg>
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
    <span className="text-honey-text text-xs font-medium whitespace-nowrap">
      {brand.needsYou} {brand.needsYou === 1 ? "needs" : "need"} you
    </span>
  );
}

/**
 * The brand switcher in the top bar (T47, design v3 "Brands"). The open brand's name is the
 * button; a honey dot on the arrow when another brand has something waiting. Picking a brand
 * reopens the same section for it.
 */
export function BrandMenu({ brands, currentId }: { brands: BrandSummary[]; currentId: string }) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const current = brands.find((b) => b.id === currentId) ?? brands[0];
  if (!current) return null;
  const othersWaiting = brands.some((b) => b.id !== current.id && b.needsYou > 0);

  const open = (tenantId: string) => {
    if (tenantId === current.id) return;
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("returnTo", pathname);
    startTransition(() => switchBrand(fd));
  };

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Brand: ${current.name}${othersWaiting ? ". Another brand needs you" : ""}`}
        disabled={pending}
        className="border-line-strong bg-surface hover:bg-subtle data-[popup-open]:bg-subtle inline-flex min-h-10 max-w-64 items-center gap-2 rounded-md border py-1 pr-2.5 pl-1.5 text-sm transition-colors duration-150 disabled:opacity-60"
      >
        <BrandAvatar brand={current} size={26} />
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
        <Menu.Positioner align="end" sideOffset={6} className="z-50">
          <Menu.Popup className="border-line bg-surface w-[340px] max-w-[calc(100vw-32px)] rounded-xl border p-1.5 shadow-[0_12px_32px_rgba(24,24,27,0.10),0_2px_6px_rgba(24,24,27,0.06)] outline-none">
            <Menu.Group>
              <Menu.GroupLabel className="text-ink-4 px-2.5 pt-2 pb-1.5 text-xs">
                Your brands
              </Menu.GroupLabel>
              {brands.map((brand) => {
                const isCurrent = brand.id === current.id;
                return (
                  <Menu.Item
                    key={brand.id}
                    onClick={() => open(brand.id)}
                    aria-current={isCurrent || undefined}
                    className={cn(
                      "data-[highlighted]:bg-subtle flex min-h-11 cursor-default items-center gap-2.5 rounded-lg p-2.5 outline-none",
                      isCurrent && "bg-subtle",
                    )}
                  >
                    <BrandAvatar brand={brand} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold">{brand.name}</span>
                      <span className="text-ink-3 flex min-w-0 items-center gap-1.5 text-xs">
                        {brand.accounts.length === 0
                          ? "No accounts connected yet"
                          : brand.accounts.map((a, i) => (
                              <span key={i} className="inline-flex min-w-0 items-center gap-1">
                                <PlatformIcon platform={a.platform} />
                                <span className="truncate">
                                  {a.username ??
                                    (a.platform === "facebook" ? "Facebook" : "Instagram")}
                                </span>
                              </span>
                            ))}
                      </span>
                    </span>
                    <BrandStatus brand={brand} />
                    <span className="inline-flex w-4 justify-center">
                      {isCurrent && <Check className="size-4" strokeWidth={2} aria-hidden />}
                    </span>
                  </Menu.Item>
                );
              })}
            </Menu.Group>
            <Menu.Separator className="bg-line mx-1 my-1.5 h-px" />
            <Menu.LinkItem
              render={<Link href="/brands/new" />}
              className="data-[highlighted]:bg-subtle text-ink flex min-h-11 items-center gap-2.5 rounded-lg p-2.5 font-medium no-underline outline-none"
            >
              <span
                aria-hidden
                className="border-line-strong inline-flex size-8 items-center justify-center rounded-md border border-dashed"
              >
                <Plus className="text-ink-2 size-3.5" strokeWidth={2} />
              </span>
              Add a brand
            </Menu.LinkItem>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
