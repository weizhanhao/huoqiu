import { contentPostRevisions, contentPosts } from "./content.js";
import { feedChannels, feedItems, feedRankingSnapshots } from "./feed.js";
import { identityProfiles, identityUsers } from "./identity.js";
import {
  exchangeCalendars,
  exchanges,
  instruments,
  listings,
} from "./instrument.js";
import {
  marketBars,
  marketEntitlementProjection,
  marketObservations,
  marketQuotes,
} from "./market.js";
import {
  moderationAppeals,
  moderationAudit,
  moderationCases,
  moderationDecisions,
  moderationEvidence,
  moderationReports,
} from "./moderation.js";
import {
  notificationDeliveryAttempts,
  notificationReadState,
  notifications,
} from "./notification.js";
import { operationsAdminAudit } from "./operations.js";
import {
  idempotencyRecords,
  inboxReceipts,
  outboxEvents,
} from "./platform-events.js";
import {
  portfolioLedgerEntries,
  portfolioPositionProjection,
  portfolios,
  portfolioValuationSnapshots,
} from "./portfolio.js";
import { searchDocuments } from "./search.js";
import {
  socialBlocks,
  socialBookmarks,
  socialComments,
  socialFollows,
  socialReactions,
} from "./social.js";
import { watchlistItems, watchlists } from "./watchlist.js";

export * from "./content.js";
export * from "./feed.js";
export * from "./identity.js";
export * from "./instrument.js";
export * from "./market.js";
export * from "./moderation.js";
export * from "./notification.js";
export * from "./operations.js";
export * from "./platform-events.js";
export * from "./portfolio.js";
export * from "./search.js";
export * from "./social.js";
export * from "./watchlist.js";

/** Public domain schema only. */
export const publicSchema = {
  contentPostRevisions,
  contentPosts,
  exchangeCalendars,
  exchanges,
  feedChannels,
  feedItems,
  feedRankingSnapshots,
  idempotencyRecords,
  identityProfiles,
  identityUsers,
  inboxReceipts,
  instruments,
  listings,
  marketBars,
  marketEntitlementProjection,
  marketObservations,
  marketQuotes,
  moderationAppeals,
  moderationAudit,
  moderationCases,
  moderationDecisions,
  moderationEvidence,
  moderationReports,
  notificationDeliveryAttempts,
  notificationReadState,
  notifications,
  operationsAdminAudit,
  outboxEvents,
  portfolioLedgerEntries,
  portfolioPositionProjection,
  portfolioValuationSnapshots,
  portfolios,
  searchDocuments,
  socialBlocks,
  socialBookmarks,
  socialComments,
  socialFollows,
  socialReactions,
  watchlistItems,
  watchlists,
} as const;
