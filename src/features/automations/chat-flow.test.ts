import { describe, expect, it } from "vitest";
import { buildFlow, FLOW_PLATFORMS, parseFlowForm } from "./chat-flow";

describe("buildFlow", () => {
  it("chains the steps after a keyword trigger and ends the run", () => {
    const flow = buildFlow({
      keywords: ["BOOK"],
      steps: [
        { kind: "send", text: "For how many people, and what day?" },
        { kind: "wait", hours: 24, saveAs: "booking" },
        { kind: "tag", tag: "booking" },
        { kind: "handoff", note: "Booking request" },
      ],
    });
    expect(flow.entryNodeId).toBe("trigger");
    expect(flow.nodes.map((n) => n.type)).toEqual([
      "trigger",
      "send_message",
      "wait_for_reply",
      "add_tag",
      "handoff",
      "end",
    ]);
    expect(flow.nodes[0].config).toEqual({
      triggerType: "inbound_message",
      keywords: ["BOOK"],
      matchType: "contains",
      cooldownHours: 24,
    });
    expect(flow.nodes[1].config).toEqual({ messageType: "text", text: "For how many people, and what day?" });
    expect(flow.nodes[2].config).toEqual({ timeoutMinutes: 1440, saveAs: "booking" });
    expect(flow.nodes[4].config).toEqual({ note: "Booking request" });
    // send → wait; the wait goes on with "reply" and stops on "timeout"
    expect(flow.edges).toEqual([
      { id: "e0", source: "trigger", target: "s1" },
      { id: "e1", source: "s1", target: "s2" },
      { id: "e2", source: "s2", target: "s3", sourceHandle: "reply" },
      { id: "e2t", source: "s2", target: "end", sourceHandle: "timeout" },
      { id: "e3", source: "s3", target: "s4" },
    ]);
  });

  it("no keywords means any message; the last plain step leads to the end", () => {
    const flow = buildFlow({ keywords: [], steps: [{ kind: "send", text: "Hi!" }] });
    expect(flow.nodes[0].config).toMatchObject({ matchType: "any", keywords: [] });
    expect(flow.edges).toContainEqual({ id: "e1", source: "s1", target: "end" });
  });
});

describe("parseFlowForm", () => {
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  const steps = JSON.stringify([
    { kind: "send", text: " Hello " },
    { kind: "wait", hours: 500, saveAs: "Answer #1" },
    { kind: "tag", tag: "" },
  ]);

  it("cleans the steps: trims text, caps the wait at 30 days, drops empty tags", () => {
    const r = parseFlowForm(form({ name: "Book", platform: "whatsapp", accountId: "acc", keywords: "BOOK", steps }));
    expect(r).toEqual({
      ok: true,
      value: {
        name: "Book",
        platform: "whatsapp",
        accountId: "acc",
        keywords: ["BOOK"],
        steps: [
          { kind: "send", text: "Hello" },
          { kind: "wait", hours: 500, saveAs: "Answer_1" },
        ],
      },
    });
  });

  it("needs a first message and a platform that runs flows", () => {
    expect(parseFlowForm(form({ name: "x", platform: "whatsapp", accountId: "a", steps: "[]" }))).toMatchObject({ ok: false, field: "steps" });
    expect(parseFlowForm(form({ name: "x", platform: "youtube", accountId: "a", steps }))).toMatchObject({ ok: false, field: "accountId" });
    expect(FLOW_PLATFORMS.has("instagram")).toBe(true);
  });
});
