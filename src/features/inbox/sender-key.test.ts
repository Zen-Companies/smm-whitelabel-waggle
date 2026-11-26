import { describe, expect, it } from "vitest";
import { automatedEmailReason } from "./email-text";
import { senderKeyFor } from "./sender-key";
import { emailHeaderNames } from "./zernio-events";

describe("senderKeyFor (Inbox by sender, 26 Nov)", () => {
  it("email: the sender's address, lower-case, from whichever field holds it", () => {
    expect(
      senderKeyFor({ kind: "dm", email: true, sender: { id: "Carla@Example.com", name: "Carla" } }),
    ).toBe("carla@example.com");
    expect(
      senderKeyFor({
        kind: "dm",
        email: true,
        sender: { id: "1789abc", name: "Carla Mendoza <carla@example.com>" },
      }),
    ).toBe("carla@example.com");
    // No address anywhere: the id, lower-case.
    expect(senderKeyFor({ kind: "dm", email: true, sender: { id: "AbC123" } })).toBe("abc123");
  });

  it("DMs: the platform's sender id as it is", () => {
    expect(senderKeyFor({ kind: "dm", email: false, sender: { id: "17841400AbC" } })).toBe(
      "17841400AbC",
    );
    expect(senderKeyFor({ kind: "dm", email: false, sender: { id: "  " } })).toBeNull();
  });

  it("comments: the commenter's id, else their handle (as the database fills it)", () => {
    expect(senderKeyFor({ kind: "comment", authorId: "1784", authorName: "jess.bakes" })).toBe(
      "1784",
    );
    expect(senderKeyFor({ kind: "comment", authorId: "", authorName: " @Jess.Bakes " })).toBe(
      "name:jess.bakes",
    );
    expect(senderKeyFor({ kind: "comment", authorName: null })).toBeNull();
  });

  it("reviews and calls are their own rows", () => {
    expect(senderKeyFor({ kind: "review" })).toBeNull();
    expect(senderKeyFor({ kind: "call" })).toBeNull();
  });

  it("keeps a key within 320 characters", () => {
    expect(senderKeyFor({ kind: "dm", email: false, sender: { id: "x".repeat(400) } })).toHaveLength(
      320,
    );
  });
});

describe("automatedEmailReason (newsletters, 26 Nov)", () => {
  it("list headers first, when the mailbox passes them", () => {
    expect(
      automatedEmailReason({
        address: "carla@example.com",
        text: "Hi",
        headerNames: ["From", "List-Unsubscribe"],
      }),
    ).toBe("list_header");
  });

  it("an unsubscribe line with a link", () => {
    expect(
      automatedEmailReason({
        address: "hello@producthunt.com",
        text: "Today's top launches (producthunt.com)\nUnsubscribe (producthunt.com)",
      }),
    ).toBe("unsubscribe_link");
    expect(
      automatedEmailReason({
        address: "digest@daily.dev",
        text: "Manage your email preferences at https://daily.dev/settings",
      }),
    ).toBe("unsubscribe_link");
  });

  it("not a customer asking to be taken off a list (no link)", () => {
    expect(
      automatedEmailReason({
        address: "ana@example.com",
        text: "Please unsubscribe me from your promos, thanks!",
      }),
    ).toBeNull();
  });

  it("bulk senders by their mailbox or their sending service", () => {
    expect(automatedEmailReason({ address: "newsletter@roamresearch.com", text: "" })).toBe(
      "bulk_sender",
    );
    expect(automatedEmailReason({ address: "updates+x@app.io", text: "" })).toBe("bulk_sender");
    expect(automatedEmailReason({ address: "bounce@mail.substack.com", text: "" })).toBe(
      "bulk_sender",
    );
  });

  it("a person writing", () => {
    expect(
      automatedEmailReason({
        address: "carla.mendoza@company.ph",
        text: "Could you also do a gluten-free option for 5 guests?",
      }),
    ).toBeNull();
    expect(automatedEmailReason({ address: null, text: null })).toBeNull();
  });

  it("reads header names in either shape", () => {
    expect(emailHeaderNames({ "List-Id": "x", Subject: "y" })).toEqual(["List-Id", "Subject"]);
    expect(emailHeaderNames([{ name: "List-Unsubscribe" }])).toEqual(["List-Unsubscribe"]);
    expect(emailHeaderNames(undefined)).toEqual([]);
  });
});
