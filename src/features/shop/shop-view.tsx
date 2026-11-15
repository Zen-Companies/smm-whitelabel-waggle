import Link from "next/link";
import { PostsHeader } from "@/features/publishing";
import * as Sentry from "@sentry/nextjs";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import type { OrderView, ProductView, StoreView } from "@/lib/social/types";
import { cn } from "cn";
import { formatMoney, missingNote, ORDER_STATUS, PAYMENT_STATUS, STORE_PLATFORMS } from "./shop";
import { StockForm } from "./stock-form";

type Tab = "products" | "orders";

function day(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function Products({
  store,
  products,
  locations,
  mayEdit,
}: {
  store: StoreView;
  products: ProductView[];
  locations: { id: string; name: string }[];
  mayEdit: boolean;
}) {
  const note = missingNote(store.platform, store.capabilities, "stock");
  const canEdit = mayEdit && !note && locations.length > 0;
  return (
    <div className="flex flex-col gap-3">
      {mayEdit && note && <p className="meta">{note}</p>}
      {products.length ? (
        <ul className="card divide-line flex flex-col divide-y">
          {products.map((p) =>
            p.variants.map((v, i) => {
              const name =
                p.variants.length > 1 || (v.title && v.title !== "Default Title")
                  ? `${p.title} · ${v.title}`
                  : p.title;
              return (
                <li key={`${p.id}:${v.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  {i === 0 && p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- the store's own image host
                    <img src={p.imageUrl} alt="" className="size-10 rounded-md object-cover" />
                  ) : (
                    <span className="bg-subtle size-10 rounded-md" aria-hidden />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="truncate font-semibold">{name}</b>
                    <span className="meta">
                      {[
                        formatMoney(v.price),
                        v.stock === null ? "Not tracked" : `${v.stock} in stock`,
                        p.status !== "active" ? "Not on sale" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {canEdit && v.stock !== null && (
                    <StockForm
                      accountId={store.accountId}
                      productId={p.id}
                      variantId={v.id}
                      label={name}
                      current={v.stock}
                      locations={locations}
                    />
                  )}
                </li>
              );
            }),
          )}
        </ul>
      ) : (
        <p className="meta">No products yet.</p>
      )}
      <p className="meta">Adding products and changing prices stay in your store for now.</p>
    </div>
  );
}

function Orders({ store, orders }: { store: StoreView; orders: OrderView[] }) {
  const note = missingNote(store.platform, store.capabilities, "orders");
  if (note) return <p className="meta">{note}</p>;
  return (
    <div className="flex flex-col gap-3">
      {orders.length ? (
        <ul className="card divide-line flex flex-col divide-y">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="font-semibold">
                  {o.number}
                  {o.customerName ? ` · ${o.customerName}` : ""}
                </b>
                <span className="meta truncate">{o.items}</span>
                <span className="meta">
                  {[
                    day(o.createdAt),
                    o.status ? (ORDER_STATUS[o.status] ?? o.status) : null,
                    o.paymentStatus ? (PAYMENT_STATUS[o.paymentStatus] ?? o.paymentStatus) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <b className="tabular-nums">{formatMoney(o.total)}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="meta">No orders yet.</p>
      )}
      <p className="meta">Refunds and order edits stay in your store.</p>
    </div>
  );
}

/** Posts → Shop (T84b, design "Posts · Shop"): products, stock and orders. */
export async function ShopPage({ site, tab: tabParam }: { site?: string; tab?: string }) {
  const tenant = await getCurrentTenant();
  const mayEdit = can(tenant.role, "posts.write");
  const tab: Tab = tabParam === "orders" ? "orders" : "products";
  const social = getSocialProvider();
  let stores: StoreView[] = [];
  let products: ProductView[] = [];
  let orders: OrderView[] = [];
  let locations: { id: string; name: string }[] = [];
  let failed = false;
  if (tenant.zernioProfileId) {
    try {
      const sites = (
        await social.listIntegrations({
          profileId: tenant.zernioProfileId,
          platforms: STORE_PLATFORMS,
          signal: AbortSignal.timeout(15_000),
        })
      ).filter((s) => s.active);
      // A WordPress site is a store only with WooCommerce (getStore returns null otherwise).
      stores = (
        await Promise.all(
          sites.map((s) =>
            social.getStore({ accountId: s.id, signal: AbortSignal.timeout(15_000) }),
          ),
        )
      ).filter((s): s is StoreView => !!s);
    } catch (error) {
      Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "shopStores" } });
      failed = true;
    }
  }
  const store = stores.find((s) => s.accountId === site) ?? stores[0];
  if (store && !failed) {
    try {
      if (tab === "products") {
        const has = (c: string) => store.capabilities.includes(c);
        [products, locations] = await Promise.all([
          social
            .listProducts({ accountId: store.accountId, signal: AbortSignal.timeout(20_000) })
            .then((r) => r.products),
          has("inventory.write")
            ? social.listStockLocations({
                accountId: store.accountId,
                signal: AbortSignal.timeout(15_000),
              })
            : Promise.resolve([]),
        ]);
      } else if (store.capabilities.includes("orders.read")) {
        orders = (
          await social.listOrders({
            accountId: store.accountId,
            signal: AbortSignal.timeout(20_000),
          })
        ).orders;
      }
    } catch (error) {
      Sentry.captureException(error, { extra: { tenantId: tenant.id, step: `shop:${tab}` } });
      failed = true;
    }
  }
  const href = (s: string, t: Tab) => `/posts/shop?site=${encodeURIComponent(s)}&tab=${t}`;
  return (
    <>
      <PostsHeader />
      {failed ? (
        <p className="danger-box">
          Your shop couldn&apos;t be loaded right now. Try again in a moment.
        </p>
      ) : !store ? (
        <div className="card flex flex-col gap-2 p-5">
          <h2 className="font-semibold">Connect your shop</h2>
          <p className="text-ink-2 text-sm">
            See products, stock and orders from a Shopify store or a WordPress site with
            WooCommerce. Connect it in Settings → Accounts → More connections.
          </p>
          <Link
            href="/settings?section=accounts"
            className="text-honey-text text-sm font-medium underline"
          >
            Open Accounts
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="meta">
              {store.platform === "shopify" ? "Shopify" : "WooCommerce"} ·{" "}
              {store.domain || store.name}
            </span>
            {stores.length > 1 && (
              <nav aria-label="Stores" className="flex flex-wrap gap-2">
                {stores.map((s) => (
                  <Link
                    key={s.accountId}
                    href={href(s.accountId, tab)}
                    aria-current={s.accountId === store.accountId ? "page" : undefined}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm",
                      s.accountId === store.accountId
                        ? "border-ink bg-ink text-surface"
                        : "border-line-strong",
                    )}
                  >
                    {s.name || s.domain}
                  </Link>
                ))}
              </nav>
            )}
          </div>
          <nav aria-label="Shop" className="flex gap-2">
            {(["products", "orders"] as const).map((t) => (
              <Link
                key={t}
                href={href(store.accountId, t)}
                aria-current={t === tab ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3.5 py-2 text-sm",
                  t === tab ? "border-ink bg-ink text-surface" : "border-line-strong",
                )}
              >
                {t === "products" ? "Products" : "Orders"}
              </Link>
            ))}
          </nav>
          {tab === "products" ? (
            <Products store={store} products={products} locations={locations} mayEdit={mayEdit} />
          ) : (
            <Orders store={store} orders={orders} />
          )}
        </div>
      )}
    </>
  );
}
