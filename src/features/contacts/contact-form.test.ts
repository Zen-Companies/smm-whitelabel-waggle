import { describe, expect, it } from "vitest";
import { normalizePhone, parseContactForm, parseImport, tagsFrom } from "./contact-form";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("contacts", () => {
  it("phone numbers become +digits", () => {
    expect(normalizePhone("+63 917 555 0142")).toBe("+639175550142");
    expect(normalizePhone("(415) 555-0142", "1")).toBe("+14155550142");
    expect(normalizePhone("0917 555 0142", "63")).toBe("+639175550142");
    expect(normalizePhone("12")).toBeNull();
  });

  it("tags are trimmed, lowercased and unique", () => {
    expect(tagsFrom(" Regular, VIP ,regular,, ")).toEqual(["regular", "vip"]);
  });

  it("reads the add form; consent is only what the owner ticked", () => {
    expect(
      parseContactForm(form({ name: "Ana Reyes", phone: "+63 917 555 0142", email: "ana@x.ph", tags: "regular", consent: "yes" })),
    ).toEqual({
      ok: true,
      value: { name: "Ana Reyes", phone: "+639175550142", email: "ana@x.ph", tags: ["regular"], subscribed: true },
    });
    const noConsent = parseContactForm(form({ name: "Jun", phone: "+639175550199" }));
    expect(noConsent.ok && noConsent.value.subscribed).toBe(false);
    expect(parseContactForm(form({ name: " " }))).toMatchObject({ ok: false, field: "name" });
    expect(parseContactForm(form({ name: "X", email: "nope" }))).toMatchObject({ ok: false, field: "email" });
  });

  it("imports a CSV with a header row (name, phone, email, tags)", () => {
    const csv = "Name,Phone,Email,Tags\nAna Reyes,+63 917 555 0142,ana@x.ph,regular;vip\n\"Lim, Paolo\",0918 555 0199,,\nNo phone,,,\n";
    const r = parseImport(csv, "63");
    expect(r.rows).toEqual([
      { name: "Ana Reyes", phone: "+639175550142", email: "ana@x.ph", tags: ["regular", "vip"] },
      { name: "Lim, Paolo", phone: "+639185550199", email: undefined, tags: [] },
    ]);
    expect(r.skipped).toBe(1);
  });

  it("caps an import at 1,000 rows", () => {
    const lines = ["name,phone", ...Array.from({ length: 1005 }, (_, i) => `P${i},+6391755${String(i).padStart(5, "0")}`)];
    const r = parseImport(lines.join("\n"), "63");
    expect(r.rows).toHaveLength(1000);
    expect(r.tooMany).toBe(true);
  });
});
