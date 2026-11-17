import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLATFORM_IDS } from "@/lib/social/platforms";
import { brandLogo } from "./brand-logos";

describe("brand logos", () => {
  it("every platform Waggle lists has its own logo file", () => {
    for (const id of PLATFORM_IDS) {
      const path = brandLogo(id);
      expect(path, id).not.toBeNull();
      expect(existsSync(join(process.cwd(), "public", path!)), path!).toBe(true);
    }
  });

  it("channels and tools have logos too", () => {
    for (const slug of ["gmail", "outlook", "shopify", "woocommerce", "hubspot", "stripe", "sms", "rcs", "imessage"]) {
      expect(existsSync(join(process.cwd(), "public", brandLogo(slug)!)), slug).toBe(true);
    }
  });

  it("unknown names have none", () => {
    expect(brandLogo("myspace")).toBeNull();
  });
});
