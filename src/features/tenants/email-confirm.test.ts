import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { confirmEmail } = await import("./email-confirm");

describe("confirmEmail", () => {
  it("greets by first name and carries the link", () => {
    const e = confirmEmail({ name: "Joy Villanueva", link: "https://x/auth/email-confirmed?token=t" });
    expect(e.subject).toBe("Confirm your email for Waggle");
    expect(e.text).toContain("Hi Joy,");
    expect(e.text).toContain("https://x/auth/email-confirmed?token=t");
    expect(e.html).toContain("Confirm my email");
  });
  it("works without a name", () => {
    expect(confirmEmail({ name: null, link: "l" }).text.startsWith("Hi,")).toBe(true);
  });
});
