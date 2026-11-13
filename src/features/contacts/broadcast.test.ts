import { describe, expect, it } from "vitest";
import { parseBroadcastForm } from "./broadcast";

const now = new Date("2026-11-13T10:00:00Z");
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const base = {
  name: "Weekend promo",
  accountId: "acc_wa",
  template: "weekend_promo|en|1",
  tag: " Regular ",
  when: "now",
};

describe("parseBroadcastForm", () => {
  it("sends now to a tag, with the template's placeholder as the person's name", () => {
    expect(parseBroadcastForm(form(base), now)).toEqual({
      ok: true,
      value: {
        name: "Weekend promo",
        accountId: "acc_wa",
        template: { name: "weekend_promo", language: "en", variables: 1 },
        tag: "regular",
        scheduledAt: null,
      },
    });
  });

  it("everyone who agreed, when no tag is given", () => {
    const r = parseBroadcastForm(form({ ...base, tag: "" }), now);
    expect(r.ok && r.value.tag).toBeNull();
  });

  it("scheduled at least 10 minutes ahead", () => {
    expect(
      parseBroadcastForm(form({ ...base, when: "later", scheduledAt: "2026-11-15T00:00:00.000Z" }), now),
    ).toMatchObject({ ok: true, value: { scheduledAt: "2026-11-15T00:00:00.000Z" } });
    expect(
      parseBroadcastForm(form({ ...base, when: "later", scheduledAt: "2026-11-13T10:05:00Z" }), now),
    ).toMatchObject({ ok: false, field: "when" });
  });

  it("needs a template with at most one placeholder, and a name", () => {
    expect(parseBroadcastForm(form({ ...base, template: "" }), now)).toMatchObject({ ok: false, field: "template" });
    expect(parseBroadcastForm(form({ ...base, template: "x|en|2" }), now)).toMatchObject({ ok: false, field: "template" });
    expect(parseBroadcastForm(form({ ...base, name: "" }), now)).toMatchObject({ ok: false, field: "name" });
  });
});
