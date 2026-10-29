import "server-only";
import { MockSocialProvider, resolveSocialProviderMode } from "./mock";
import { createZernioProvider } from "./zernio";
import type { SocialProvider } from "./types";

export { createZernioProvider, ZernioSocialProvider } from "./zernio";
export { isSocialPlatform, SOCIAL_PLATFORMS, SocialProviderError } from "./types";
export type {
  AccountHealth,
  CreatePostInput,
  ProviderMessage,
  ProviderPostStatus,
  SocialPlatform,
  SocialProvider,
} from "./types";

export { MockSocialProvider, resolveSocialProviderMode } from "./mock";

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
