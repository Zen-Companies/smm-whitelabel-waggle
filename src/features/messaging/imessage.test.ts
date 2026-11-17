import { describe, expect, it } from "vitest";
import type { ImessageSenderView } from "@/lib/social/types";
import { currentSender, holdsNumber, optInLinkWith, parseOrder } from "./imessage";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const base = { region: "US", agree: "yes", cardName: "Harbour Bean" };

describe("parseOrder (T83c)", () => {
  it("a picked number, or one the carrier assigns near a ZIP", () => {
    expect(parseOrder(form({ ...base, availableNumberId: "n1" }))).toEqual({
      ok: true,
      value: { region: "US", availableNumberId: "n1", cardName: "Harbour Bean" },
    });
    expect(parseOrder(form({ ...base, availableNumberId: "any", zipCode: "94105" }))).toEqual({
      ok: true,
      value: { region: "US", zipCode: "94105", cardName: "Harbour Bean" },
    });
    expect(parseOrder(form({ ...base, region: "GB", zipCode: "94105" }))).toMatchObject({
      field: "zipCode",
    });
  });

  it("needs the price confirmed, a region and a card name", () => {
    expect(parseOrder(form({ ...base, agree: "" }))).toMatchObject({ field: "agree" });
    expect(parseOrder(form({ ...base, region: "FR" }))).toMatchObject({ field: "region" });
    expect(parseOrder(form({ ...base, cardName: "" }))).toMatchObject({ field: "cardName" });
  });
});

describe("senders", () => {
  const s = (id: string, status: ImessageSenderView["status"]) =>
    ({ id, status }) as ImessageSenderView;
  it("shows the live number before a failed order; a failed one can be retried", () => {
    expect(currentSender([s("1", "failed"), s("2", "activating")])?.id).toBe("2");
    expect(currentSender([s("1", "failed")])?.id).toBe("1");
    expect(holdsNumber([s("1", "failed")])).toBe(false);
    expect(holdsNumber([s("1", "active")])).toBe(true);
  });

  it("puts the brand's first message in the opt-in link", () => {
    expect(optInLinkWith("imessage://+14155550170?body=Hi", "Hi Harbour Bean!")).toBe(
      "imessage://+14155550170?body=Hi+Harbour+Bean%21",
    );
  });
});
