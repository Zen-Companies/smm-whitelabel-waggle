import { describe, expect, it } from "vitest";
import {
  isAutomatedEmail,
  isEmailPlatform,
  ownEmailDomains,
  readableEmailText,
  senderAddress,
} from "./email-text";

describe("readableEmailText", () => {
  it("turns tracking links into their site and drops wrapped link pieces", () => {
    const raw = [
      "Three things to set up today, about 15 minutes.",
      "",
      "Connect your accounts [https://email.mail.gowaggle.ai/c/eJxsIF9zqjoUxT9NeLMTwt888CBa",
      "Hyx-",
      "LrcMoMFHGGL2waTNRFNUBNRPRVyJEVR8ScifvOjHBuu-",
      "Bv7W_zj8OfUj1il9TQvV_YW9aSl2COBc6zGUpj2PUq-",
      "",
      "",
      "",
      "See you there, https://www.gowaggle.ai/help?x=1",
    ].join("\n");
    expect(readableEmailText(raw)).toBe(
      [
        "Three things to set up today, about 15 minutes.",
        "",
        "Connect your accounts (email.mail.gowaggle.ai)",
        "Hyx-",
        "",
        "See you there, (gowaggle.ai)",
      ].join("\n"),
    );
  });

  it("keeps ordinary words and is safe to run twice", () => {
    const text = "Hi! Do you have oat milk?\n\nThanks,\nAna";
    expect(readableEmailText(text)).toBe(text);
    const once = readableEmailText("Menu <https://example.com/menu.pdf>");
    expect(once).toBe("Menu (example.com)");
    expect(readableEmailText(once)).toBe(once);
  });
});

describe("automatic emails", () => {
  const own = ownEmailDomains("Waggle <alerts@mail.gowaggle.ai>");

  it("finds the sender's address in any field", () => {
    expect(senderAddress({ id: "thread-1", name: "Waggle <Hello@Mail.GoWaggle.ai>" })).toBe(
      "hello@mail.gowaggle.ai",
    );
    expect(senderAddress({ id: "ana@zoho.com" })).toBe("ana@zoho.com");
    expect(senderAddress({ id: "12345" })).toBeNull();
  });

  it("no-reply senders and Waggle's own mail need no answer; customers do", () => {
    expect(isAutomatedEmail("noreply@shop.com", own)).toBe(true);
    expect(isAutomatedEmail("no-reply+abc@shop.com", own)).toBe(true);
    expect(isAutomatedEmail("notifications@github.com", own)).toBe(true);
    expect(isAutomatedEmail("hello@mail.gowaggle.ai", own)).toBe(true);
    expect(isAutomatedEmail("jason@gowaggle.ai", own)).toBe(true);
    expect(isAutomatedEmail("ana@zoho.com", own)).toBe(false);
    expect(isAutomatedEmail("info@cafe.com", own)).toBe(false);
    expect(isAutomatedEmail("ana@notgowaggle.ai", own)).toBe(false);
    expect(isAutomatedEmail(null, own)).toBe(false);
  });

  it("only mailboxes count as email", () => {
    expect(isEmailPlatform("google")).toBe(true);
    expect(isEmailPlatform("imap")).toBe(true);
    expect(isEmailPlatform("instagram")).toBe(false);
  });
});
