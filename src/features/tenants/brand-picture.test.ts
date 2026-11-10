import { describe, expect, it } from "vitest";
import { brandPicturePath } from "./brand-picture";

const accounts = [
  { id: "ig", picture_path: null },
  { id: "fb", picture_path: "accounts/fb/1.png" },
  { id: "tt", picture_path: "accounts/tt/1.png" },
];

describe("brandPicturePath", () => {
  it("uses the chosen account's picture", () => {
    expect(
      brandPicturePath(
        { picture_source: "account", picture_path: null, picture_account_id: "tt" },
        accounts,
      ),
    ).toBe("accounts/tt/1.png");
  });
  it("falls back to the first account with a picture", () => {
    expect(
      brandPicturePath(
        { picture_source: "account", picture_path: null, picture_account_id: "ig" },
        accounts,
      ),
    ).toBe("accounts/fb/1.png");
    expect(
      brandPicturePath(
        { picture_source: "account", picture_path: null, picture_account_id: null },
        [],
      ),
    ).toBeNull();
  });
  it("uses the upload, or nothing", () => {
    expect(
      brandPicturePath(
        { picture_source: "upload", picture_path: "brands/x/1.png", picture_account_id: "fb" },
        accounts,
      ),
    ).toBe("brands/x/1.png");
    expect(
      brandPicturePath(
        { picture_source: "none", picture_path: "brands/x/1.png", picture_account_id: "fb" },
        accounts,
      ),
    ).toBeNull();
  });
});
