import { describe, expect, it } from "vitest";
import { DAY_MS } from "./idle";
import { disconnectDay, idleWarningEmail } from "./email";

const now = new Date("2026-11-20T12:00:00Z");
const input = {
  orgName: "Harbour Bean Café",
  firstName: "Walter",
  accounts: [{ platformLabel: "Instagram", username: "harbourbean" }],
  daysAway: 23,
  disconnectOn: new Date(now.getTime() + 7 * DAY_MS),
  now,
  appUrl: "https://app.example.com/",
};

describe("idleWarningEmail", () => {
  it("names the one account in the subject", () => {
    const email = idleWarningEmail(input);
    expect(email.subject).toBe("@harbourbean disconnects in 7 days");
    expect(email.text).toContain(
      "Hi Walter, you haven’t signed in to Waggle for 23 days. On the Free plan, we disconnect @harbourbean after 30 days away, on Friday, November 27.",
    );
    expect(email.text).toContain(
      "Sign in once to keep it connected. Your answers and settings stay either way.",
    );
    expect(email.text).toContain("Sign in to Waggle: https://app.example.com/login");
    expect(email.text).toContain(
      "Paid plans never disconnect for being away. To stay connected while you’re away, upgrade to Solo or above.",
    );
    expect(email.html).toContain("Sign in to Waggle");
    expect(email.html).toContain("@harbourbean disconnects in 7 days");
  });

  it("says 'Your accounts' for several", () => {
    const email = idleWarningEmail({
      ...input,
      firstName: null,
      accounts: [...input.accounts, { platformLabel: "Facebook", username: null }],
    });
    expect(email.subject).toBe("Your accounts disconnect in 7 days");
    expect(email.text).toContain(
      "You haven’t signed in to Waggle for 23 days. On the Free plan, we disconnect @harbourbean and your Facebook account",
    );
    expect(email.text).toContain("Sign in once to keep them connected.");
  });

  it("escapes names in the HTML", () => {
    const email = idleWarningEmail({ ...input, orgName: "<b>Cafe</b>" });
    expect(email.html).not.toContain("<b>Cafe</b>");
  });
});

describe("disconnectDay", () => {
  it("reads as a day", () => {
    expect(disconnectDay(new Date("2026-11-27T12:00:00Z"))).toBe("Friday, November 27");
  });
});
