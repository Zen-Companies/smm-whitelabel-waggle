import { describe, expect, it } from "vitest";
import { leadsCsv, leadStage, moveLabel, nextLine, nextStage } from "./lead-stage";

describe("Leads board (T74d)", () => {
  it("places a lead: by hand, else by whether someone replied", () => {
    expect(leadStage(null, "awaiting_approval")).toBe("new");
    expect(leadStage(null, "sent")).toBe("talking");
    expect(leadStage("booked", "sent")).toBe("booked");
    expect(leadStage("nonsense", "handled")).toBe("talking");
  });

  it("offers one move", () => {
    expect(nextStage("new")).toBe("talking");
    expect(moveLabel("talking")).toBe("Move to Booked");
    expect(moveLabel("done")).toBe("Back to Talking");
  });

  it("says what's waiting", () => {
    expect(nextLine("awaiting_approval")).toBe("Your reply is waiting in the Inbox");
    expect(nextLine("sent")).toBeNull();
  });

  it("downloads a safe spreadsheet", () => {
    const csv = leadsCsv([
      {
        createdAt: "2026-11-15T10:00:00Z",
        name: 'Maya "M" Reyes',
        contact: "=HYPERLINK(1)",
        wants: "Showing, Saturday",
        stage: "new",
        source: "Instagram DM",
      },
    ]);
    expect(csv).toBe(
      'Date,Name,Contact,Wants,Stage,Came from\r\n2026-11-15,"Maya ""M"" Reyes",\'=HYPERLINK(1),"Showing, Saturday",New,Instagram DM\r\n',
    );
  });
});
