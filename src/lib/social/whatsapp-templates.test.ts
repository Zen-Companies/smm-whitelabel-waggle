import { describe, expect, it } from "vitest";
import {
  bodyOf,
  renderTemplate,
  statusText,
  templateLabel,
  templateNameFrom,
  toMetaBody,
  variableCount,
} from "./whatsapp-templates";

describe("WhatsApp templates (T67)", () => {
  it("reads the body and its placeholders from Meta's components", () => {
    const body = bodyOf([
      { type: "HEADER", text: "Hi" },
      { type: "BODY", text: "Hi {{1}}, order {{2}} is ready." },
    ]);
    expect(body).toBe("Hi {{1}}, order {{2}} is ready.");
    expect(variableCount(body)).toBe(2);
    expect(bodyOf(null)).toBe("");
    expect(variableCount("No placeholders")).toBe(0);
  });

  it("fills the values in", () => {
    expect(renderTemplate("Hi {{1}}, thanks!", ["Ana"])).toBe("Hi Ana, thanks!");
    expect(renderTemplate("Hi {{1}} {{2}}", ["Ana"])).toBe("Hi Ana {{2}}");
  });

  it("turns the owner's [name] into Meta's {{1}}", () => {
    expect(toMetaBody(" Hi [name], your order is ready. ")).toEqual({
      body: "Hi {{1}}, your order is ready.",
      variables: 1,
    });
    expect(toMetaBody("We're open again!")).toEqual({ body: "We're open again!", variables: 0 });
  });

  it("makes a Meta name from the owner's label, and back", () => {
    expect(templateNameFrom("Order ready for pickup!")).toBe("order_ready_for_pickup");
    expect(templateNameFrom("2-for-1 Fridays")).toBe("t_2for1_fridays");
    expect(templateLabel("order_ready_for_pickup")).toBe("Order ready for pickup");
  });

  it("says each status in plain words", () => {
    expect(statusText("APPROVED")).toEqual({ text: "Approved", tone: "ok" });
    expect(statusText("PENDING").text).toBe("In review");
    expect(statusText("REJECTED").tone).toBe("bad");
  });
});
