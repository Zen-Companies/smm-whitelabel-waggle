import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { PLATFORM_IDS, PLATFORMS } from "@/lib/social/platforms";

// Whitelabel (T68): owners and their customers never see the name of Waggle's social layer,
// except in the "Before you connect" note (design "Every Zernio platform", approved 18 Nov), which
// names it on purpose before a sign-in that shows it. Pages only our own team opens may name it.
const ALLOWED = [
  "src/features/accounts/connect-note-box.tsx",
  "src/features/platforms",
  "src/app/(dashboard)/admin",
  "src/features/billing/cost-view.tsx",
  "src/features/lab",
  "src/features/offboarding",
  "src/features/staff",
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** Source without comments, so only text that can reach the screen is checked. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("whitelabel", () => {
  it("no owner-facing page or component names Zernio", () => {
    const root = process.cwd();
    const pages = [...files(join(root, "src", "app")), ...files(join(root, "src", "features"))]
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => relative(root, f).split(sep).join("/"))
      .filter((f) => !ALLOWED.some((s) => f.startsWith(s)));
    // The word itself; code names like `zernio_account_id` never reach the screen.
    const leaks = pages.filter((f) => /\bZernio\b/.test(withoutComments(readFileSync(f, "utf8"))));
    expect(leaks).toEqual([]);
  });

  it("no platform tile line names Zernio", () => {
    const lines = PLATFORM_IDS.flatMap((id) => [PLATFORMS[id].line, PLATFORMS[id].needs ?? ""]);
    expect(lines.filter((l) => /zernio/i.test(l))).toEqual([]);
  });

  it("X stays off until the beta (Coming soon)", () => {
    expect(PLATFORMS.twitter.connect).toBe("none");
  });
});
