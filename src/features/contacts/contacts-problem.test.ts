import { describe, expect, it } from "vitest";
import { SocialProviderError } from "@/lib/social/types";
import { contactsProblem } from "./contacts-problem";

const err = (status?: number) => new SocialProviderError("x", { status, ambiguous: false });

describe("contactsProblem", () => {
  it("an unknown or forbidden business is not set up, not an outage", () => {
    expect(contactsProblem(err(404))).toBe("not_set_up");
    expect(contactsProblem(err(403))).toBe("not_set_up");
  });
  it("anything a retry can fix is an outage", () => {
    expect(contactsProblem(err(500))).toBe("down");
    expect(contactsProblem(err(429))).toBe("down");
    expect(contactsProblem(err(undefined))).toBe("down");
    expect(contactsProblem(new Error("timeout"))).toBe("down");
  });
});
