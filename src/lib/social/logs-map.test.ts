import { describe, expect, it } from "vitest";
import { toProviderLog, toProviderLogs } from "./logs-map";

describe("toProviderLogs", () => {
  it("keeps codes and ids, never bodies", () => {
    const [l] = toProviderLogs({
      logs: [
        {
          type: "api_request",
          status: "success",
          status_code: 200,
          request_id: "req_1",
          method: "GET",
          path: "/api/v1/connect/facebook",
          operation_id: "getConnectUrl",
          request_body: '{"secret":"x"}',
          response_body: '{"authUrl":"https://..."}',
          created_at: "2026-11-26T16:57:24Z",
        },
      ],
    });
    expect(l).toMatchObject({
      type: "api_request",
      statusCode: 200,
      requestId: "req_1",
      path: "/api/v1/connect/facebook",
      operationId: "getConnectUrl",
    });
    expect(JSON.stringify(l)).not.toMatch(/secret|authUrl/);
  });

  it("reads connect fields from the entry or its metadata", () => {
    expect(
      toProviderLog({
        type: "connections",
        action: "account.connected",
        platform: "instagram",
        created_at: "2026-11-26T17:00:00Z",
        metadata: JSON.stringify({
          event_type: "connect_success",
          success_username: "harbourbean",
          success_account_type: "business",
        }),
      }),
    ).toMatchObject({
      eventType: "connect_success",
      successUsername: "harbourbean",
      successAccountType: "business",
    });
    expect(
      toProviderLog({
        type: "connections",
        success_username: "top",
        metadata: "not json",
        created_at: "2026-11-26T17:00:00Z",
      }),
    ).toMatchObject({ successUsername: "top", eventType: null });
  });

  it("drops entries without a date and survives junk", () => {
    expect(toProviderLogs({ logs: [{ type: "x" }, null, 3] })).toEqual([]);
    expect(toProviderLogs({})).toEqual([]);
    expect(toProviderLogs(null)).toEqual([]);
  });
});
