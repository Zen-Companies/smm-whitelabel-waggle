import { describe, expect, it } from "vitest";
import { catchUpKickRequest, kickCatchUp, MAX_KICK_HOPS } from "./kick";

describe("catchUpKickRequest", () => {
  const env = { APP_URL: "https://app.example.com/", CRON_SECRET: "s3cret" };

  it("posts the tenant to the catch-up jobs route with the job secret", () => {
    const r = catchUpKickRequest(env, "t1", 0)!;
    expect(r.url).toBe("https://app.example.com/api/jobs/catch-up");
    expect(r.init.method).toBe("POST");
    expect((r.init.headers as Record<string, string>).Authorization).toBe("Bearer s3cret");
    expect(JSON.parse(r.init.body as string)).toEqual({ tenantId: "t1", hop: 0 });
  });

  it("passes Vercel's protection bypass when it's set (staging behind Vercel Authentication)", () => {
    const plain = catchUpKickRequest(env, "t1", 0)!.init.headers as Record<string, string>;
    expect(plain["x-vercel-protection-bypass"]).toBeUndefined();
    const r = catchUpKickRequest({ ...env, VERCEL_AUTOMATION_BYPASS_SECRET: "byp" }, "t1", 0)!;
    expect((r.init.headers as Record<string, string>)["x-vercel-protection-bypass"]).toBe("byp");
  });

  it("does nothing without the URL or the secret, or past the last hop", () => {
    expect(catchUpKickRequest({ CRON_SECRET: "x" }, "t1", 0)).toBeNull();
    expect(catchUpKickRequest({ APP_URL: "https://a" }, "t1", 0)).toBeNull();
    expect(catchUpKickRequest(env, "t1", MAX_KICK_HOPS + 1)).toBeNull();
  });

  it("outside a request, kicking is a no-op (the cron run picks it up)", () => {
    expect(() => kickCatchUp("t1")).not.toThrow();
  });
});
