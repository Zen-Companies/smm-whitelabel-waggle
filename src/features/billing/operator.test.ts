import { describe, expect, it } from "vitest";
import { isOperator } from "./operator";

describe("isOperator", () => {
  it("only the operator role in app_metadata counts", () => {
    expect(isOperator({ app_metadata: { role: "operator" } })).toBe(true);
    expect(isOperator({ app_metadata: { provider: "email" } })).toBe(false);
    expect(isOperator({ app_metadata: { role: "owner" } })).toBe(false);
    expect(isOperator(null)).toBe(false);
  });

  it("user_metadata, which users can edit themselves, never counts", () => {
    const user = { app_metadata: {}, user_metadata: { role: "operator" } };
    expect(isOperator(user)).toBe(false);
  });
});
