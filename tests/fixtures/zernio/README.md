# Zernio webhook fixtures

Payloads for `/api/webhooks/zernio` tests (docs/tdd.md §7.1, §16).

These are **not yet captured from live traffic**: they follow the `@zernio/node` 0.2.1369 payload types
(`WebhookPayloadComment`, `WebhookPayloadMessage`, `WebhookPayloadPost`, `WebhookPayloadAccountConnected`,
`WebhookPayloadAccountDisconnected`) field for field. Replace them with real deliveries from the staging
test profile in T18 (keep the placeholders).

Placeholders, filled in by `tests/integration/webhook.test.ts`:

| Placeholder      | Value                                           |
| ---------------- | ----------------------------------------------- |
| `__TENANT_ID__`  | the test tenant's id (`profiles[0].externalId`) |
| `__PROFILE_ID__` | the tenant's `zernio_profile_id`                |
| `__ACCOUNT_ID__` | the Zernio account id                           |
| `__POST_ID__`    | the Zernio post id                              |

Customer names and messages are made up.
