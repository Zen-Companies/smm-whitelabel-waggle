import "server-only";
import { MockSocialProvider, resolveSocialProviderMode } from "./mock";
import { createZernioProvider } from "./zernio";
import type { SocialProvider } from "./types";

export {
  createZernioProvider,
  isPlatformPaused,
  parseRetryAfter,
  ZernioSocialProvider,
} from "./zernio";
export {
  clearPlatformPause,
  getPlatformPause,
  PLATFORM_PAUSE_PROBE_MS,
  PLATFORM_PAUSE_RETRY_SECONDS,
  recordPlatformPause,
  updatePlatformPause,
} from "./platform-pause";
export type { PlatformPause } from "./platform-pause";
export type * from "./analytics-types";
export { isSocialPlatform, SOCIAL_PLATFORMS, SocialProviderError } from "./types";
export type {
  AccountHealth,
  CallOptions,
  CreatePostInput,
  ProviderComment,
  ProviderCommentReply,
  ProviderMessage,
  ProviderPostStatus,
  ProviderUsage,
  SocialPlatform,
  SocialProvider,
} from "./types";

export { MOCK_MEDIA_DIR, MockSocialProvider, resolveSocialProviderMode } from "./mock";

const providers: Partial<Record<"mock" | "zernio", SocialProvider>> = {};

/**
 * Zernio, or the in-process mock when `SOCIAL_PROVIDER_MODE=mock` (default under Vitest). The
 * mode is read on every call, so changing it (e.g. in .env.local while `next dev` runs) never
 * leaves a cached instance of the other kind in use.
 */
export function getSocialProvider(): SocialProvider {
  const mode = resolveSocialProviderMode(process.env);
  if (!providers[mode]) {
    if (mode === "mock") {
      providers.mock = new MockSocialProvider();
    } else {
      const apiKey = process.env.ZERNIO_API_KEY;
      if (!apiKey) throw new Error("ZERNIO_API_KEY must be set");
      providers.zernio = createZernioProvider({ apiKey });
    }
  }
  return providers[mode]!;
}
