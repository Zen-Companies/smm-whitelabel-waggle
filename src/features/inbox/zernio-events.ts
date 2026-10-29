import { z } from "zod";

// The fields we use from Zernio webhook payloads (docs/tdd.md §7.1, @zernio/node types
// WebhookPayloadComment / Message / Post / AccountConnected / AccountDisconnected). Unknown
// fields are ignored; the full payload is kept in webhook_events.

export const envelopeSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
  test: z.boolean().optional(),
  profiles: z.array(z.object({ id: z.string(), externalId: z.string().nullable() })).optional(),
});
export type ZernioEnvelope = z.infer<typeof envelopeSchema>;

const accountBlock = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1).optional(),
  platform: z.string(),
  username: z.string(),
});

export const commentEventSchema = z.object({
  event: z.literal("comment.received"),
  comment: z.object({
    id: z.string().min(1),
    postId: z.string().nullable(),
    platformPostId: z.string().min(1),
    platform: z.string(),
    text: z.string(),
    author: z.object({
      id: z.string(),
      username: z.string().optional(),
      name: z.string().optional(),
      isOwnAccount: z.boolean().optional(),
    }),
    createdAt: z.string(),
  }),
  account: accountBlock,
});

export const messageEventSchema = z.object({
  event: z.literal("message.received"),
  message: z.object({
    id: z.string().min(1),
    conversationId: z.string().min(1),
    platform: z.string(),
    direction: z.enum(["incoming", "outgoing"]),
    text: z.string().nullable(),
    sender: z.object({
      id: z.string(),
      name: z.string().optional(),
      username: z.string().optional(),
    }),
    sentAt: z.string(),
  }),
  conversation: z
    .object({ participantName: z.string().optional(), participantUsername: z.string().optional() })
    .optional(),
  account: accountBlock,
});

/**
 * WebhookPayloadMessageDeliveryStatus. `message.platformMessageId` is the id our send got back
 * (send response `data.messageId`). Zernio only reports failures for WhatsApp, SMS and RCS today,
 * so for Instagram/Facebook this never fires; handled in case that changes.
 */
export const messageFailedSchema = z.object({
  event: z.literal("message.failed"),
  message: z.object({
    id: z.string().min(1),
    platformMessageId: z.string().optional(),
  }),
  error: z.object({ code: z.number().optional(), title: z.string().optional() }).nullish(),
});

export const postEventSchema = z.object({
  event: z.enum(["post.published", "post.partial", "post.failed", "post.cancelled"]),
  post: z.object({
    id: z.string().min(1),
    publishedAt: z.string().optional(),
    platforms: z.array(
      z.object({
        platform: z.string(),
        status: z.string(),
        publishedUrl: z.string().optional(),
        error: z.string().optional(),
        errorCategory: z.string().optional(),
        errorSource: z.string().optional(),
      }),
    ),
  }),
});

export const accountConnectedSchema = z.object({
  event: z.literal("account.connected"),
  account: z.object({
    accountId: z.string().min(1),
    profileId: z.string(),
    platform: z.string(),
    username: z.string(),
  }),
});

export const accountDisconnectedSchema = z.object({
  event: z.literal("account.disconnected"),
  account: z.object({
    accountId: z.string().min(1),
    profileId: z.string(),
    platform: z.string(),
    username: z.string(),
    disconnectionType: z.string().optional(),
    reason: z.string().optional(),
  }),
});

/** The accountId field is canonical; `id` carries the same value (docs.zernio.com/webhooks). */
export function zernioAccountIdOf(account: z.infer<typeof accountBlock>): string {
  return account.accountId ?? account.id;
}
