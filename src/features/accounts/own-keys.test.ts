import { describe, expect, it } from "vitest";
import {
  MORE_CONNECTIONS,
  OWN_KEY_PLATFORMS,
  parseEmail,
  parseLineKeys,
  parseSiteKeys,
  parseWhatsAppKeys,
} from "./own-keys";

const form = (v: Record<string, string>) => {
  const f = new FormData();
  for (const [k, val] of Object.entries(v)) f.set(k, val);
  return f;
};

describe("parseSiteKeys", () => {
  it("Shopify: any form of the store address becomes x.myshopify.com", () => {
    for (const shop of [
      "harbour-bean",
      "harbour-bean.myshopify.com",
      "https://harbour-bean.myshopify.com/admin",
    ]) {
      expect(
        parseSiteKeys("shopify", form({ shop, accessToken: " shpat_0123456789abcdef " })),
      ).toEqual({
        ok: true,
        keys: {
          kind: "shopify",
          shop: "harbour-bean.myshopify.com",
          accessToken: "shpat_0123456789abcdef",
        },
      });
    }
    expect(parseSiteKeys("shopify", form({ shop: "x", accessToken: "nope" }))).toMatchObject({
      ok: false,
      field: "accessToken",
    });
    expect(
      parseSiteKeys("shopify", form({ shop: "bad shop!", accessToken: "shpat_x" })),
    ).toMatchObject({
      ok: false,
      field: "shop",
    });
  });

  it("WordPress: an https site root, the username and the app password", () => {
    expect(
      parseSiteKeys(
        "wordpress",
        form({
          siteUrl: "https://harbourbean.ph/wp-json/",
          username: "maria",
          applicationPassword: "abcd efgh ijkl mnop qrst uvwx",
        }),
      ),
    ).toEqual({
      ok: true,
      keys: {
        kind: "wordpress",
        siteUrl: "https://harbourbean.ph",
        username: "maria",
        applicationPassword: "abcd efgh ijkl mnop qrst uvwx",
      },
    });
    expect(
      parseSiteKeys(
        "wordpress",
        form({
          siteUrl: "http://harbourbean.ph",
          username: "m",
          applicationPassword: "x".repeat(24),
        }),
      ),
    ).toMatchObject({ ok: false, field: "siteUrl" });
    expect(
      parseSiteKeys(
        "wordpress",
        form({ siteUrl: "https://a:b@x.ph", username: "m", applicationPassword: "x".repeat(24) }),
      ),
    ).toMatchObject({ ok: false, field: "siteUrl" });
    expect(
      parseSiteKeys(
        "wordpress",
        form({ siteUrl: "https://x.ph", username: "m", applicationPassword: "short" }),
      ),
    ).toMatchObject({ ok: false, field: "applicationPassword" });
  });

  it("Webflow: a site key", () => {
    expect(parseSiteKeys("webflow", form({ siteToken: "a".repeat(40) }))).toEqual({
      ok: true,
      keys: { kind: "webflow", siteToken: "a".repeat(40) },
    });
    expect(parseSiteKeys("webflow", form({ siteToken: "" }))).toMatchObject({
      ok: false,
      field: "siteToken",
    });
  });
});

describe("parseWhatsAppKeys", () => {
  const ok = {
    accessToken: "EAAG".padEnd(60, "x"),
    wabaId: "1029384756",
    phoneNumberId: "5566778899",
    pin: "",
  };
  it("takes the token, ids and an optional 6-digit PIN", () => {
    expect(parseWhatsAppKeys(form(ok))).toEqual({
      ok: true,
      value: { accessToken: ok.accessToken, wabaId: "1029384756", phoneNumberId: "5566778899" },
    });
    expect(parseWhatsAppKeys(form({ ...ok, pin: "123456" }))).toMatchObject({
      ok: true,
      value: { pin: "123456" },
    });
    expect(parseWhatsAppKeys(form({ ...ok, pin: "12" }))).toMatchObject({
      ok: false,
      field: "pin",
    });
    expect(parseWhatsAppKeys(form({ ...ok, wabaId: "abc" }))).toMatchObject({
      ok: false,
      field: "wabaId",
    });
  });
});

describe("parseLineKeys and parseEmail", () => {
  it("LINE: a numeric channel id and a 32-character secret", () => {
    expect(
      parseLineKeys(
        form({ channelId: "2001234567", channelSecret: "0123456789abcdef0123456789abcdef" }),
      ),
    ).toEqual({
      ok: true,
      value: { channelId: "2001234567", channelSecret: "0123456789abcdef0123456789abcdef" },
    });
    expect(parseLineKeys(form({ channelId: "abc", channelSecret: "x" }))).toMatchObject({
      field: "channelId",
    });
    expect(parseLineKeys(form({ channelId: "2001234567", channelSecret: "short" }))).toMatchObject({
      field: "channelSecret",
    });
  });

  it("email: lower-cased and checked", () => {
    expect(parseEmail(form({ email: " Ana@Zoho.com " }))).toEqual({
      ok: true,
      email: "ana@zoho.com",
    });
    expect(parseEmail(form({ email: "ana@" }))).toMatchObject({ ok: false, field: "email" });
  });
});

describe("MORE_CONNECTIONS", () => {
  it("only key-paste and Waggle's own pages connect today; the rest say Coming soon", () => {
    const items = MORE_CONNECTIONS.flatMap((g) => g.items);
    expect(items.filter((i) => i.how === "keys").map((i) => i.id)).toEqual([...OWN_KEY_PLATFORMS]);
    expect(items.find((i) => i.id === "email")).toMatchObject({ how: "email", platform: "imap" });
    // LINE connects from its own tile (T81a).
    expect(items.find((i) => i.id === "line")).toBeUndefined();
    for (const id of [
      "hubspot",
      "wix",
      "stripe",
      "googleanalytics",
      "googleads",
      "tiktokads",
      "wechat",
    ]) {
      expect(items.find((i) => i.id === id)?.how).toBe("soon");
    }
    expect(items.find((i) => i.id === "metaads")).toMatchObject({
      how: "link",
      href: "/posts/ads",
    });
  });
});
