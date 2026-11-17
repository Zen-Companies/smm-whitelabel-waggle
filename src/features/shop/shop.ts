import type { Money } from "@/lib/social/types";

// Shop (T84b, design "Posts · Shop"): a connected Shopify or WooCommerce store's products, stock
// and orders through Zernio's Commerce API (docs.zernio.com/guides/commerce). Stores are the
// brand's own key-connected sites (T80a). Refunds and order edits stay in the store's own admin.
// Shopify's "grant permissions" link installs the partner's app, so it's never shown: stores
// connected with their own key add permissions to the app they made.

export const STORE_PLATFORMS = ["shopify", "wordpress"] as const;

/** "₱1,200" from {amount: "1200.00", currency: "PHP"}. */
export function formatMoney(m: Money | null): string {
  if (!m) return "";
  const n = Number(m.amount);
  if (!Number.isFinite(n)) return `${m.amount} ${m.currency}`;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: m.currency,
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    }).format(n);
  } catch {
    return `${m.amount} ${m.currency}`;
  }
}

export const ORDER_STATUS: Record<string, string> = {
  pending_payment: "Waiting for payment",
  on_hold: "On hold",
  awaiting_fulfillment: "To send",
  partially_fulfilled: "Partly sent",
  in_transit: "On the way",
  delivered: "Delivered",
  completed: "Done",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS: Record<string, string> = {
  pending: "Not paid yet",
  authorized: "Authorized",
  partially_paid: "Part paid",
  paid: "Paid",
  partially_refunded: "Part refunded",
  refunded: "Refunded",
  voided: "Voided",
  failed: "Payment failed",
};

/** What the owner needs to add to see or edit something, per store kind. */
export function missingNote(
  platform: "shopify" | "woocommerce",
  capabilities: string[],
  need: "stock" | "orders",
): string | null {
  const has = (c: string) => capabilities.includes(c);
  if (need === "stock" && has("inventory.write")) return null;
  if (need === "orders" && has("orders.read")) return null;
  if (platform === "woocommerce") {
    return need === "stock"
      ? "Your WordPress user can't change stock. Use an admin or Shop manager login in Settings → Accounts."
      : "Your WordPress user can't see orders. Use an admin or Shop manager login in Settings → Accounts.";
  }
  return need === "stock"
    ? "To edit stock here, add the read_inventory, write_inventory and read_locations permissions to the app you made in Shopify, then reconnect the store in Settings → Accounts."
    : "To see orders here, add the read_orders permission to the app you made in Shopify, then reconnect the store in Settings → Accounts.";
}

/** The new stock count from the form: a whole number, 0 to 1,000,000. */
export function parseStock(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!/^\d{1,7}$/.test(s)) return null;
  const n = Number(s);
  return n <= 1_000_000 ? n : null;
}
