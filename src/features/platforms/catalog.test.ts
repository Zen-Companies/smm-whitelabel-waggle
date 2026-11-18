import { describe, expect, it } from "vitest";
import { allowedStatuses, resolveStatus, statusOf, switchableOf } from "./catalog";

describe("platform statuses (Staff → Platforms, 18 Nov)", () => {
  it("platforms whose sign-in names Zernio start as Coming soon", () => {
    for (const id of ["googleanalytics", "googleads", "slack", "twitter"]) {
      expect(resolveStatus(switchableOf(id)!, null)).toBe("soon");
    }
  });

  it("platforms owners connect today stay available by default", () => {
    expect(resolveStatus(switchableOf("instagram")!, null)).toBe("available");
    expect(resolveStatus(switchableOf("gmail")!, null)).toBe("available");
  });

  it("not built or blocked: never Available, even if stored", () => {
    expect(allowedStatuses(switchableOf("snapchat")!)).toEqual(["hidden", "soon"]);
    expect(resolveStatus(switchableOf("snapchat")!, "available")).toBe("soon");
    expect(resolveStatus(switchableOf("reddit")!, "available")).toBe("soon");
    expect(resolveStatus(switchableOf("discord")!, "hidden")).toBe("hidden");
  });

  it("every connection Zernio offers can be turned on (18 Nov); they start as Coming soon", () => {
    for (const id of ["wix", "hubspot", "salesforce", "stripe", "wechat", "xads", "tiktokads"]) {
      expect(resolveStatus(switchableOf(id)!, "available")).toBe("available");
      expect(resolveStatus(switchableOf(id)!, null)).toBe("soon");
    }
  });

  it("a stored choice wins when allowed", () => {
    expect(resolveStatus(switchableOf("googleanalytics")!, "available")).toBe("available");
    expect(resolveStatus(switchableOf("instagram")!, "hidden")).toBe("hidden");
    expect(resolveStatus(switchableOf("instagram")!, "nonsense")).toBe("available");
  });

  it("ids not on the list keep working", () => {
    expect(statusOf(new Map(), "phone")).toBe("available");
    expect(statusOf(new Map(), "slack")).toBe("soon");
  });
});
