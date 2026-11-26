import { describe, expect, it } from "vitest";
import { MAX_WEEKLY_HOPS, weeklyKickRequest } from "./kick";

describe("weeklyKickRequest", () => {
  const env = { APP_URL: "https://app.example.com/", CRON_SECRET: "s3cret" };
  it("posts the business to the weekly job with the job secret", () => {
    const r = weeklyKickRequest(env, "t1", 0)!;
    expect(r.url).toBe("https://app.example.com/api/jobs/weekly");
    expect((r.init.headers as Record<string, string>).Authorization).toBe("Bearer s3cret");
    expect(JSON.parse(String(r.init.body))).toEqual({ tenantId: "t1", hop: 0 });
  });
  it("does nothing without the app URL or secret, or after the last hop", () => {
    expect(weeklyKickRequest({ CRON_SECRET: "x" }, "t1", 0)).toBeNull();
    expect(weeklyKickRequest(env, "t1", MAX_WEEKLY_HOPS + 1)).toBeNull();
  });
});
