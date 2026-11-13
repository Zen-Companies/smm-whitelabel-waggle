import { describe, expect, it } from "vitest";
import { composeAlert, escalationReason } from "./compose";

const ctx = { businessName: "Harbour Bean", appUrl: "https://app.test" };

describe("composeAlert", () => {
  it("escalation: who, why and a link to the item, no message text", () => {
    const email = composeAlert(
      {
        kind: "escalation",
        itemId: "item-1",
        itemKind: "comment",
        platform: "instagram",
        authorName: "jen",
        category: "faq",
        status: "escalated",
        reason: "needs_human",
      },
      ctx,
    );
    expect(email.subject).toBe("Harbour Bean: a Instagram comment from jen needs you");
    expect(email.text).toContain("Your knowledge base doesn't cover the question.");
    expect(email.text).toContain("https://app.test/inbox/items/item-1");
    expect(email.html).toContain('href="https://app.test/inbox/items/item-1"');
  });

  it("a failed send says so", () => {
    const email = composeAlert(
      {
        kind: "escalation",
        itemId: "i",
        itemKind: "dm",
        platform: "facebook",
        authorName: null,
        category: "lead",
        status: "failed",
        reason: "retries_exhausted",
      },
      ctx,
    );
    expect(email.subject).toBe("Harbour Bean: a Facebook DM from A customer couldn't be answered");
    expect(email.text).toContain("after 3 tries");
  });

  it("lead: the lead's details and a link to the conversation", () => {
    const email = composeAlert(
      {
        kind: "lead",
        itemId: "item-2",
        itemKind: "dm",
        platform: "instagram",
        authorName: "carlo.r",
        name: "Carlo",
        contact: "0917 555 0101",
        request: "Table for 8, Saturday 7pm",
      },
      ctx,
    );
    expect(email.subject).toBe("Harbour Bean: new lead from Carlo");
    expect(email.text).toContain("Contact: 0917 555 0101");
    expect(email.text).toContain("Request: Table for 8, Saturday 7pm");
    expect(email.text).toContain("https://app.test/inbox/items/item-2");
  });

  it("a missed call or voicemail: who called and what to do (T82b)", () => {
    const email = composeAlert(
      {
        kind: "escalation",
        itemId: "item-9",
        itemKind: "call",
        platform: "phone",
        authorName: "+14155550110",
        category: null,
        status: "escalated",
        reason: "voicemail",
      },
      ctx,
    );
    expect(email.subject).toBe("Harbour Bean: a phone call from +14155550110 needs you");
    expect(email.text).toContain("They left a voicemail.");
    expect(email.text).toContain("https://app.test/inbox/items/item-9");
  });

  it("rcs status: what to do next, the review note, a link to Messaging (T83b)", () => {
    const fix = composeAlert(
      { kind: "rcs_status", status: "changes_requested", reason: "Use the IRS name." },
      ctx,
    );
    expect(fix.subject).toBe("Harbour Bean: your branded texts request needs a fix");
    expect(fix.text).toContain("The note: “Use the IRS name.”");
    expect(fix.text).toContain("https://app.test/settings?section=messaging");
    expect(composeAlert({ kind: "rcs_status", status: "testing", reason: null }, ctx).subject).toBe(
      "Harbour Bean: branded texts are ready to test",
    );
    expect(
      composeAlert({ kind: "rcs_status", status: "testing", reason: "No STOP reply." }, ctx)
        .subject,
    ).toBe("Harbour Bean: your launch details came back");
    expect(composeAlert({ kind: "rcs_status", status: "live", reason: null }, ctx).text).toContain(
      "https://app.test/inbox",
    );
    expect(
      composeAlert({ kind: "rcs_status", status: "rejected", reason: "Brand not verified." }, ctx)
        .text,
    ).toContain("Brand not verified.");
  });

  it("ad lead: every answer, the consent, and a link to the leads (T78d)", () => {
    const email = composeAlert(
      {
        kind: "ad_lead",
        formName: "Catering inquiry",
        fields: { first_name: "Ana", last_name: "Cruz", phone_number: "+639175550142", q1: "40" },
        agreedToMessages: false,
      },
      ctx,
    );
    expect(email.subject).toBe("Harbour Bean: new lead from Ana Cruz");
    expect(email.text).toContain("Someone filled Catering inquiry in your ad.");
    expect(email.text).toContain("Phone number: +639175550142");
    expect(email.text).toContain("didn't tick the messages box");
    expect(email.text).toContain("https://app.test/contacts/ad-leads");
    expect(
      composeAlert({ kind: "ad_lead", formName: null, fields: {}, agreedToMessages: true }, ctx)
        .subject,
    ).toBe("Harbour Bean: new lead from your ad");
  });

  it("disconnect links to settings; nudge counts drafts", () => {
    expect(
      composeAlert({ kind: "disconnect", platform: "instagram", username: "harbourbean" }, ctx),
    ).toMatchObject({
      subject: "Harbour Bean: Instagram @harbourbean disconnected",
      text: expect.stringContaining("https://app.test/settings"),
    });
    expect(composeAlert({ kind: "draft_waiting", count: 1 }, ctx).subject).toBe(
      "Harbour Bean: 1 reply is waiting for your approval",
    );
    expect(composeAlert({ kind: "draft_waiting", count: 3 }, ctx).subject).toBe(
      "Harbour Bean: 3 replies are waiting for your approval",
    );
  });

  it("escapes names in the HTML", () => {
    const email = composeAlert(
      {
        kind: "lead",
        itemId: "i",
        itemKind: "comment",
        platform: "instagram",
        authorName: null,
        name: "<script>x</script>",
        contact: null,
        request: null,
      },
      ctx,
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("unknown reasons fall back by status", () => {
    expect(escalationReason(null, "escalated")).toBe("Waggle handed it to you.");
    expect(escalationReason("weird", "failed")).toBe("Something went wrong handling it.");
  });
});
