import { describe, expect, it } from "vitest";
import { parseThemePref, resolveTheme, THEME_BOOT_SCRIPT, THEME_KEY } from "./theme";

describe("theme", () => {
  it("reads a saved choice, anything else is light", () => {
    expect(parseThemePref("dark")).toBe("dark");
    expect(parseThemePref("system")).toBe("system");
    expect(parseThemePref("light")).toBe("light");
    expect(parseThemePref(null)).toBe("light");
    expect(parseThemePref("purple")).toBe("light");
  });

  it("match device follows the device", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("the boot script sets data-theme from the same key, and never throws", () => {
    const html = { dataset: {} as Record<string, string> };
    const run = new Function("document", "localStorage", "matchMedia", THEME_BOOT_SCRIPT);
    run({ documentElement: html }, { getItem: (k: string) => (k === THEME_KEY ? "dark" : null) }, () => ({ matches: false }));
    expect(html.dataset.theme).toBe("dark");

    const html2 = { dataset: {} as Record<string, string> };
    run(
      { documentElement: html2 },
      { getItem: () => { throw new Error("blocked"); } },
      () => ({ matches: true }),
    );
    expect(html2.dataset.theme).toBe("light");
  });
});
