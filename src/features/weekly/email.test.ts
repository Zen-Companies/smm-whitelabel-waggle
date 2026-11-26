import { describe, expect, it } from "vitest";
import { weeklyEmail } from "./email";

const base = {
  businessName: "Harbour Bean Café",
  range: "23–29 Nov",
  appUrl: "https://app.example.com/",
  summary: {
    cameIn: 148,
    answeredByWaggle: 96,
    answeredByYou: 35,
    waiting: 9,
    closingToday: 3,
    found: 8,
    tooOld: 0,
    previousCameIn: 136,
    accounts: [],
    topics: [
      { topic: "price", label: "Prices", count: 41 },
      { topic: "hours", label: "Opening hours", count: 27 },
      { topic: "order", label: "Wants to buy", count: 22 },
      { topic: "praise", label: "Compliments", count: 19 },
    ],
    gaps: [
      { text: "Do you have gluten-free bread?", times: 5 },
      { text: "Can I bring my dog inside?", times: 3 },
      { text: "Do you cater for parties?", times: 2 },
    ],
  },
};

describe("weeklyEmail", () => {
  it("leads with the numbers and the questions to answer", () => {
    const e = weeklyEmail(base);
    expect(e.subject).toBe("Your week: 148 messages, 3 questions to answer");
    expect(e.text).toContain("Harbour Bean Café · 23–29 Nov");
    expect(e.text).toContain(
      "148 messages came in. Waggle and you answered 131. 9 are still waiting, and Waggle found 8 it had missed (they're in your Inbox now).",
    );
    expect(e.text).toContain("People mostly asked about prices, opening hours and wanting to buy.");
    expect(e.text).toContain(
      '"Do you have gluten-free bread?" (5×) · "Can I bring my dog inside?" (3×) · "Do you cater for parties?" (2×)',
    );
    expect(e.text).toContain("Write the answers: https://app.example.com/teach#questions");
    expect(e.html).toContain("Write the answers");
    expect(e.html).toContain("https://app.example.com/settings/notifications");
  });

  it("says nothing about customers but the questions (no names, no message text)", () => {
    const e = weeklyEmail(base);
    expect(e.text).not.toMatch(/mika|jordan/i);
  });

  it("drops the questions part when everything is covered", () => {
    const e = weeklyEmail({ ...base, summary: { ...base.summary, gaps: [] } });
    expect(e.subject).toBe("Your week: 148 messages");
    expect(e.text).not.toContain("couldn't answer");
    expect(e.text).toContain("See your week: https://app.example.com/insights/work?period=7");
  });

  it("says a week with nothing waiting and nothing missed plainly", () => {
    const e = weeklyEmail({
      ...base,
      summary: { ...base.summary, waiting: 0, found: 0, gaps: [], cameIn: 40 },
    });
    expect(e.text).toContain("40 messages came in. Waggle and you answered 131. None are waiting.");
  });

  it("is one line for a quiet week", () => {
    const e = weeklyEmail({
      ...base,
      summary: {
        ...base.summary,
        cameIn: 4,
        answeredByWaggle: 3,
        answeredByYou: 1,
        waiting: 0,
        found: 0,
        gaps: [],
        topics: [],
      },
    });
    expect(e.subject).toBe("Your week: a quiet one");
    expect(e.text).toContain("A quiet week: 4 messages, all answered.");
    expect(e.text).not.toContain("People mostly asked");
  });

  it("escapes the questions in the HTML", () => {
    const e = weeklyEmail({
      ...base,
      summary: { ...base.summary, gaps: [{ text: "<b>Open?</b>", times: 1 }] },
    });
    expect(e.html).toContain("&lt;b&gt;Open?&lt;/b&gt;");
    expect(e.subject).toBe("Your week: 148 messages, 1 question to answer");
  });
});
