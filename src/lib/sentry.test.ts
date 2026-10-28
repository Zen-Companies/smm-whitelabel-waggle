import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubEvent } from "./sentry";

describe("scrubEvent", () => {
  it("drops request body and cookies but keeps the url", () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        url: "https://app.example/api/webhooks/zernio",
        data: '{"text":"customer message"}',
        cookies: { session: "abc" },
      },
    };

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.url).toBe("https://app.example/api/webhooks/zernio");
  });

  it("passes events without a request through", () => {
    const event: ErrorEvent = { type: undefined, message: "boom" };
    expect(scrubEvent(event)).toEqual({ type: undefined, message: "boom" });
  });
});
