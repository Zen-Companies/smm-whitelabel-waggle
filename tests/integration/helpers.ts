import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { inject } from "vitest";
import { SocialProviderError, type SocialProvider } from "@/lib/social/types";
import type { Database } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";

export function serviceClient(): ServiceClient {
  return createClient<Database>(inject("supabaseUrl"), inject("supabaseServiceKey"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient() {
  return createClient<Database>(inject("supabaseUrl"), inject("supabaseAnonKey"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const uniqueEmail = () => `it-${randomUUID()}@test.local`;

/**
 * In-memory stand-in for Zernio's profile API: one profile per externalId, and a second create
 * gets the same 409 the real API returns (the adapter maps it to alreadyExisted).
 */
export function fakeZernio() {
  const profiles = new Map<string, { id: string; name: string }>();
  let loseNextResponse = false;

  const notImplemented = () => {
    throw new Error("not used in this test");
  };
  const provider: SocialProvider = {
    async createProfile({ name, externalId }) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const existing = profiles.get(externalId);
      if (existing) return { profileId: existing.id, alreadyExisted: true };
      const id = `prof_${randomUUID().slice(0, 8)}`;
      profiles.set(externalId, { id, name });
      if (loseNextResponse) {
        loseNextResponse = false;
        // Created on Zernio's side, but the response never arrived.
        throw new SocialProviderError("Zernio createProfile failed (TimeoutError)", {
          ambiguous: true,
        });
      }
      return { profileId: id, alreadyExisted: false };
    },
    getConnectUrl: notImplemented,
    connectBluesky: notImplemented,
    presignMedia: notImplemented,
    listPinterestBoards: notImplemented,
    getQueue: notImplemented,
    enableSms: notImplemented,
    listSmsRegistrations: notImplemented,
    startSmsRegistration: notImplemented,
    verifySmsRegistrationCode: notImplemented,
    resendSmsRegistrationCode: notImplemented,
    listRcsAgents: notImplemented,
    listBlogs: notImplemented,
    getStore: notImplemented,
    listFiles: notImplemented,
    copyFileToMedia: notImplemented,
    listProducts: notImplemented,
    listStockLocations: notImplemented,
    setStock: notImplemented,
    listOrders: notImplemented,
    listBlogArticles: notImplemented,
    createBlogArticle: notImplemented,
    requestRcsAgent: notImplemented,
    updateRcsAgent: notImplemented,
    uploadRcsAsset: notImplemented,
    addRcsTestDevice: notImplemented,
    removeRcsTestDevice: notImplemented,
    requestRcsLaunch: notImplemented,
    listImessageSenders: notImplemented,
    listImessageNumbers: notImplemented,
    orderImessageSender: notImplemented,
    updateImessageSender: notImplemented,
    cancelImessageSender: notImplemented,
    setVoice: notImplemented,
    getCallRecordingUrl: notImplemented,
    listPhoneCountries: notImplemented,
    searchPhoneNumbers: notImplemented,
    purchasePhoneNumber: notImplemented,
    listOwnedNumbers: notImplemented,
    releasePhoneNumber: notImplemented,
    listCalendarEvents: notImplemented,
    createCalendarEvent: notImplemented,
    getMailConnectUrl: notImplemented,
    discoverEmail: notImplemented,
    connectEmail: notImplemented,
    connectLine: notImplemented,
    listIntegrations: notImplemented,
    connectSiteWithKeys: notImplemented,
    connectWhatsAppWithKeys: notImplemented,
    connectMetaAds: notImplemented,
    connectSameTokenAds: notImplemented,
    getMessageAttachmentUrl: notImplemented,
    listAdConnections: notImplemented,
    listAdAccounts: notImplemented,
    boostPost: notImplemented,
    listAdCampaigns: notImplemented,
    setAdCampaignStatus: notImplemented,
    listAdRules: notImplemented,
    createAdRule: notImplemented,
    setAdRuleEnabled: notImplemented,
    deleteAdRule: notImplemented,
    listLeadForms: notImplemented,
    createLeadForm: notImplemented,
    listAdLeads: notImplemented,
    updateAdLeadStatus: notImplemented,
    listBroadcasts: notImplemented,
    createWhatsAppBroadcast: notImplemented,
    startBroadcast: notImplemented,
    cancelBroadcast: notImplemented,
    listContacts: notImplemented,
    createContact: notImplemented,
    importContacts: notImplemented,
    updateContact: notImplemented,
    listSequences: notImplemented,
    createSequence: notImplemented,
    setSequenceActive: notImplemented,
    deleteSequence: notImplemented,
    enrollInSequence: notImplemented,
    listContactIdsByTag: notImplemented,
    listWorkflows: notImplemented,
    createWorkflow: notImplemented,
    setWorkflowActive: notImplemented,
    deleteWorkflow: notImplemented,
    listCommentAutomations: notImplemented,
    createCommentAutomation: notImplemented,
    updateCommentAutomation: notImplemented,
    deleteCommentAutomation: notImplemented,
    listCommentAutomationLogs: notImplemented,
    getGoogleBusinessPerformance: notImplemented,
    unpublishPost: notImplemented,
    saveQueue: notImplemented,
    listWhatsAppTemplates: notImplemented,
    createWhatsAppTemplate: notImplemented,
    startTelegramConnect: notImplemented,
    checkTelegramConnect: notImplemented,
    createPost: notImplemented,
    validatePost: notImplemented,
    replyToComment: notImplemented,
    hideComment: notImplemented,
    unhideComment: notImplemented,
    sendPrivateReply: notImplemented,
    listReviews: notImplemented,
    replyToReview: notImplemented,
    getAnalyticsDashboard: notImplemented,
    listPostAnalytics: notImplemented,
    getFollowerStats: notImplemented,
    getBestTimeToPost: notImplemented,
    getDemographics: notImplemented,
    getOnlineFollowers: notImplemented,
    getPostTimeline: notImplemented,
    sendDm: notImplemented,
    listConversationMessages: notImplemented,
    listCommentReplies: notImplemented,
    getAccountsHealth: notImplemented,
    listAccountPictures: notImplemented,
    ping: notImplemented,
    uploadMedia: notImplemented,
    deletePost: notImplemented,
    listCommentedPosts: notImplemented,
    listPostComments: notImplemented,
    getUsageByProfile: notImplemented,
    disconnectAccount: notImplemented,
    deleteProfile: notImplemented,
  };
  return {
    provider,
    profiles,
    loseNextResponse: () => {
      loseNextResponse = true;
    },
  };
}

/** claimItems narrowed to one tenant: other (live) items are released untouched. */
export function claimFor(tenantId: () => string) {
  return async (client: ServiceClient, limit: number, statuses?: string[]) => {
    const { claimItems, releaseItems } = await import("@/lib/jobs");
    const items = await claimItems(client, limit, { statuses });
    await releaseItems(
      client,
      items.filter((i) => i.tenantId !== tenantId()).map((i) => i.id),
    );
    return items.filter((i) => i.tenantId === tenantId());
  };
}
