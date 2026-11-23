import { describe, expect, it } from "vitest";
import {
  anythingElse,
  contactProblem,
  hoursAnswerOf,
  joinAddress,
  joinContact,
  savedBubble,
  splitAddress,
  splitContact,
} from "./chat-editors";
import { fieldValue } from "./chat-fields";
import { withNewHours } from "./chat-hours";

describe("address and landmark", () => {
  it("splits the landmark out and joins it back (the replica's format)", () => {
    expect(splitAddress("12 Mabini St (Across from the church)")).toEqual({
      address: "12 Mabini St",
      landmark: "Across from the church",
    });
    expect(splitAddress("12 Mabini St")).toEqual({ address: "12 Mabini St", landmark: "" });
    expect(joinAddress(" 12 Mabini St ", " Across from the church ")).toBe(
      "12 Mabini St (Across from the church)",
    );
    expect(joinAddress("12 Mabini St", "  ")).toBe("12 Mabini St");
    expect(fieldValue("address", joinAddress("12 Mabini St", "Near the plaza"))).toBe(
      "12 Mabini St (Near the plaza)",
    );
  });
});

describe("phone and email", () => {
  it("reads the phone and email from a contact line, keeping the rest", () => {
    expect(splitContact("0917 123 4567 · hello@bean.ph")).toEqual({
      phone: "0917 123 4567",
      email: "hello@bean.ph",
      rest: [],
    });
    expect(splitContact("Call 0917 123 4567, email hello@bean.ph, www.bean.ph")).toEqual({
      phone: "0917 123 4567",
      email: "hello@bean.ph",
      rest: ["www.bean.ph"],
    });
    expect(splitContact("")).toEqual({ phone: "", email: "", rest: [] });
  });

  it("joins them into a line the contact check accepts", () => {
    const line = joinContact("0917 123 4567", "hello@bean.ph", ["www.bean.ph"]);
    expect(line).toBe("0917 123 4567 · hello@bean.ph · www.bean.ph");
    expect(fieldValue("contact", line)).toBe(line);
    expect(joinContact("", "hello@bean.ph")).toBe("hello@bean.ph");
  });

  it("checks each field like the contact check does", () => {
    expect(contactProblem("", "")).toBe("Add a phone number or an email.");
    expect(contactProblem("12", "")).toBe("That phone number doesn’t look right.");
    expect(contactProblem("", "hello@bean")).toBe("That email doesn’t look right.");
    expect(contactProblem("+63 917 123 4567", "")).toBeNull();
    expect(contactProblem("", "hello@bean.ph")).toBeNull();
  });
});

describe("after a save", () => {
  it("says the replica's lines", () => {
    expect(savedBubble("Address", "12 Mabini St")).toBe("✓ Address: 12 Mabini St");
    expect(anythingElse("Updated.", true)).toBe("Updated. Anything else?");
    expect(anythingElse("Updated.", false)).toBe("Updated.");
  });

  it("finds the answer about the hours", () => {
    const known = [
      { id: "h", field: "hours" as const, label: "Opening hours", value: "Mon 9am–5pm" },
      { id: "a1", field: "answer" as const, label: "Do you deliver?", value: "Yes." },
      { id: "a2", field: "answer" as const, label: "When are you open?", value: "Daily 8–6." },
    ];
    expect(hoursAnswerOf(known)?.id).toBe("a2");
    expect(hoursAnswerOf(known.slice(0, 2))).toBeNull();
  });

  it("rewrites the hours in that answer, keeping the rest (the replica's)", () => {
    expect(
      withNewHours(
        "We're open Mon-Sat 7am-7pm. Last orders 30 minutes before closing. Closed on holidays.",
        "Mon–Sat 8am–6pm, Sun closed",
      ),
    ).toBe(
      "We’re open Mon–Sat 8am–6pm, Sun closed. Last orders 30 minutes before closing. Closed on holidays.",
    );
  });
});
