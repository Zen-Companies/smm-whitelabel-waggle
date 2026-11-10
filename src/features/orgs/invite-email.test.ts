import { describe, expect, it } from "vitest";
import { brandsPhrase, inviteEmail, type InviteEmailInput } from "./invite-email";

const base: InviteEmailInput = {
  orgName: "Harbour Bean Group",
  inviterName: "Ana Reyes",
  role: "member",
  allBrands: false,
  brandNames: ["Poblacion branch"],
  email: "maria.santos@gmail.com",
  expiresAt: new Date("2026-11-17T09:00:00Z"),
  link: "https://waggle.test/invite/tok",
  hasLogin: false,
};

describe("inviteEmail", () => {
  it("asks someone with no login to create one", () => {
    const e = inviteEmail(base);
    expect(e.subject).toBe("Ana Reyes invited you to Harbour Bean Group on Waggle");
    expect(e.text).toContain("Ana Reyes invited you as a Member for Poblacion branch.");
    expect(e.text).toContain("Create your login to join: https://waggle.test/invite/tok");
    expect(e.text).toContain("This invite is for maria.santos@gmail.com and works until Nov 17.");
  });

  it("says Join to someone who has a login", () => {
    const e = inviteEmail({ ...base, hasLogin: true, role: "admin", allBrands: true });
    expect(e.text).toContain("as an Admin for all its brands.");
    expect(e.html).toContain(">Join Harbour Bean Group</a>");
  });

  it("escapes names in the HTML", () => {
    const e = inviteEmail({ ...base, orgName: "<b>Bad</b> & Co" });
    expect(e.html).not.toContain("<b>Bad</b>");
    expect(e.html).toContain("&#60;b&#62;Bad&#60;/b&#62; &#38; Co");
  });
});

describe("brandsPhrase", () => {
  it("lists brands in a sentence", () => {
    expect(brandsPhrase(true, ["A"])).toBe("all its brands");
    expect(brandsPhrase(false, ["A", "B", "C"])).toBe("A, B and C");
  });
});
