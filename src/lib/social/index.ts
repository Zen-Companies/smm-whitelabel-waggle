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

let provider: SocialProvider | undefined;

/** Zernio, or the in-process mock when `SOCIAL_PROVIDER_MODE=mock` (default under Vitest). */
export function getSocialProvider(): SocialProvider {
  if (!provider) {
    if (resolveSocialProviderMode(process.env) === "mock") {
      provider = new MockSocialProvider();
    } else {
      const apiKey = process.env.ZERNIO_API_KEY;
      if (!apiKey) throw new Error("ZERNIO_API_KEY must be set");
      provider = createZernioProvider({ apiKey });
    }
  }
  return provider;
}
