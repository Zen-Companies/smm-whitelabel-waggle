import { describe, expect, it } from "vitest";
import { isOperatorEmail } from "./operator";

describe("isOperatorEmail", () => {
  it("matches the configured list, case-insensitively", () => {
    const env = { OPERATOR_EMAILS: "Ops@Example.com, me@x.dev", NODE_ENV: "production" };
    expect(isOperatorEmail("ops@example.com", env)).toBe(true);
    expect(isOperatorEmail("owner@cafe.ph", env)).toBe(false);
    expect(isOperatorEmail(null, env)).toBe(false);
  });

  it("unset: open in local development, closed in production", () => {
    expect(isOperatorEmail("anyone@x.dev", { NODE_ENV: "development" })).toBe(true);
    expect(isOperatorEmail("anyone@x.dev", { NODE_ENV: "production" })).toBe(false);
    expect(
      isOperatorEmail("anyone@x.dev", { NODE_ENV: "development", VERCEL_ENV: "production" }),
    ).toBe(false);
  });
});
