import { expect, it } from "vitest";
import { versionLabels } from "./version-labels";

it("versionLabels: shows the date, numbering a second version on the same day", () => {
  expect(versionLabels(["2026-10-29.1", "2026-11-20.1", "2026-11-20.2", "custom"])).toEqual({
    "2026-10-29.1": "29 Oct",
    "2026-11-20.1": "20 Nov",
    "2026-11-20.2": "20 Nov (2)",
    custom: "custom",
  });
});
