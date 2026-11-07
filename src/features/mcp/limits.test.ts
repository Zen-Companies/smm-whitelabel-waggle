import { describe, expect, it } from "vitest";
import {
  brandOfCall,
  kindOf,
  limitsFromEnv,
  overLimit,
  redactArgs,
  type CallCounts,
} from "./limits";

const limits = limitsFromEnv({});
const quiet: CallCounts = {
  userClientMinute: 1,
  userDay: 1,
  brandActsHour: 1,
  brandSendsBurst: 1,
  brandSendsDay: 1,
};

describe("limitsFromEnv", () => {
  it("defaults: 60/min, 1000/day, 30 actions/hour, 10 sends per 10 min, 100 sends/day", () => {
    expect(limits).toEqual({
      perMinute: 60,
      perDay: 1000,
      actsPerHour: 30,
      burstSends: 10,
      dailySends: 100,
    });
  });
  it("env overrides only with positive whole numbers", () => {
    expect(limitsFromEnv({ MCP_DAILY_SEND_CAP: "250", MCP_BURST_SEND_CAP: "-1" })).toMatchObject({
      dailySends: 250,
      burstSends: 10,
    });
  });
});

describe("overLimit", () => {
  it("nothing over: null", () => {
    expect(overLimit("send", quiet, limits, null)).toBeNull();
  });
  it("calls per minute and per day, for every kind", () => {
    expect(overLimit("read", { ...quiet, userClientMinute: 61 }, limits, null)?.code).toBe(
      "rate_limited",
    );
    expect(overLimit("read", { ...quiet, userDay: 1001 }, limits, null)?.code).toBe("rate_limited");
  });
  it("reads ignore the brand's action and send limits", () => {
    expect(
      overLimit("read", { ...quiet, brandActsHour: 99, brandSendsDay: 999 }, limits, null),
    ).toBeNull();
  });
  it("the 11th send in 10 minutes is refused; the 10th goes", () => {
    expect(overLimit("send", { ...quiet, brandSendsBurst: 10 }, limits, null)).toBeNull();
    expect(overLimit("send", { ...quiet, brandSendsBurst: 11 }, limits, null)?.code).toBe(
      "rate_limited",
    );
  });
  it("the daily limit, or the brand's own", () => {
    expect(overLimit("send", { ...quiet, brandSendsDay: 101 }, limits, null)?.code).toBe(
      "daily_limit",
    );
    expect(overLimit("send", { ...quiet, brandSendsDay: 101 }, limits, 250)).toBeNull();
    expect(overLimit("send", { ...quiet, brandSendsDay: 251 }, limits, 250)?.message).toContain(
      "250",
    );
  });
  it("actions per hour count for non-send actions too", () => {
    expect(overLimit("act", { ...quiet, brandActsHour: 31 }, limits, null)?.code).toBe(
      "rate_limited",
    );
  });
});

describe("redactArgs", () => {
  it("keeps ids, numbers, choices; never free text", () => {
    expect(
      redactArgs({
        brand_id: "a1000000-0000-4000-8000-000000000001",
        tab: "for_you",
        period: 30,
        hidden: true,
        body: "So sorry about your latte!",
        query: "parking",
        account_ids: ["a2000000-0000-4000-8000-000000000001"],
      }),
    ).toEqual({
      brand_id: "a1000000-0000-4000-8000-000000000001",
      tab: "for_you",
      period: 30,
      hidden: true,
      body: "[text, 26 chars]",
      query: "[text, 7 chars]",
      account_ids: ["a2000000-0000-4000-8000-000000000001"],
    });
  });
  it("a long value in a kept field is still hidden", () => {
    expect(redactArgs({ action: "x".repeat(41) })).toEqual({ action: "[text, 41 chars]" });
    expect(redactArgs("nope")).toEqual({});
  });
});

it("kindOf: replies and posts are sends", () => {
  expect(kindOf({ name: "approve_reply", access: "act" })).toBe("send");
  expect(kindOf({ name: "create_post", access: "act" })).toBe("send");
  expect(kindOf({ name: "hide_comment", access: "act" })).toBe("act");
  expect(kindOf({ name: "list_inbox", access: "read" })).toBe("read");
});

it("brandOfCall: only a brand the assistant may use", () => {
  expect(brandOfCall({ brand_id: "b1" }, ["b1", "b2"])).toBe("b1");
  expect(brandOfCall({ brand_id: "zz" }, ["b1"])).toBeNull();
  expect(brandOfCall({}, ["b1"])).toBe("b1");
  expect(brandOfCall({}, ["b1", "b2"])).toBeNull();
});
