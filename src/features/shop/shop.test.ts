import { describe, expect, it } from "vitest";
import { formatMoney, missingNote, parseStock } from "./shop";

describe("shop (T84b)", () => {
  it("formats store money", () => {
    expect(formatMoney({ amount: "1200.00", currency: "PHP" })).toBe("₱1,200");
    expect(formatMoney({ amount: "49.50", currency: "USD" })).toBe("$49.50");
    expect(formatMoney(null)).toBe("");
  });

  it("asks for the right permission, never the partner's install link", () => {
    expect(missingNote("shopify", ["inventory.write"], "stock")).toBeNull();
    expect(missingNote("shopify", [], "stock")).toContain("write_inventory");
    expect(missingNote("shopify", [], "orders")).toContain("read_orders");
    expect(missingNote("woocommerce", [], "orders")).toContain("Shop manager");
  });

  it("takes a whole stock count", () => {
    expect(parseStock("12")).toBe(12);
    expect(parseStock("0")).toBe(0);
    expect(parseStock("-1")).toBeNull();
    expect(parseStock("2.5")).toBeNull();
    expect(parseStock("")).toBeNull();
  });
});
