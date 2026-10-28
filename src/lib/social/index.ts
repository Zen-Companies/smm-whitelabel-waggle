import "server-only";
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

let provider: SocialProvider | undefined;

export function getSocialProvider(): SocialProvider {
  if (!provider) {
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) throw new Error("ZERNIO_API_KEY must be set");
    provider = createZernioProvider({ apiKey });
  }
  return provider;
}
