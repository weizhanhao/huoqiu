import { z } from "zod4";

import { safeDeepLinkSchema } from "../m1/common.js";
import {
  eventInt64StringSchema,
  eventResourceIdSchema,
  eventTimestampSchema,
} from "./envelope.js";

const safeCodeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_.:-]*$/u, "Expected a bounded public code");

const encodedResourceFirstCharacter = String.raw`(?:[A-Za-z0-9]|%(?:3[0-9]|4[1-9A-Fa-f]|5[0-9Aa]|6[1-9A-Fa-f]|7[0-9Aa]))`;
const encodedResourceRemainingCharacter = String.raw`(?:[A-Za-z0-9._:-]|%(?:2[DdEe]|3[0-9Aa]|4[1-9A-Fa-f]|5[0-9AaFf]|6[1-9A-Fa-f]|7[0-9Aa]))`;
const encodedResourceId = `${encodedResourceFirstCharacter}${encodedResourceRemainingCharacter}{0,127}`;

// This serializable subset is deliberately no broader than the canonical
// runtime policy. The refine below remains the source-of-truth check.
const eventDeepLinkAllowlistPattern = new RegExp(
  String.raw`^(?:/|/(?:login|watchlist|compose|notifications|portfolios)|/search(?:\?q=[A-Za-z0-9._:-]{1,120})?|/(?:instruments|posts|portfolios)/${encodedResourceId}|huoqiu://(?:home|login|watchlist|compose|notifications|portfolios)|huoqiu://search(?:\?q=[A-Za-z0-9._:-]{1,120})?|huoqiu://(?:instrument|post|portfolio)/${encodedResourceId})(?![\s\S])`,
  "u",
);

const approvedDeepLinkSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(
    eventDeepLinkAllowlistPattern,
    "Expected a serializable approved deep-link route",
  )
  .refine((value) => safeDeepLinkSchema.safeParse(value).success, {
    message: "Expected an approved Web or huoqiu App registry deep link",
  })
  .meta({ "x-deep-link-policy": "approved-registry" })
  .nullable();

const identityRegisteredPayloadSchema = z
  .object({
    user_id: eventResourceIdSchema,
    reason: z.literal("registration"),
    effective_at: eventTimestampSchema,
  })
  .strict();

const identitySuspendedPayloadSchema = z
  .object({
    user_id: eventResourceIdSchema,
    reason: safeCodeSchema,
    effective_at: eventTimestampSchema,
  })
  .strict();

const createPostPayloadSchema = <Status extends string>(status: Status) =>
  z
    .object({
      post_id: eventResourceIdSchema,
      author_id: eventResourceIdSchema,
      status: z.literal(status),
      version: eventInt64StringSchema,
    })
    .strict();

const createCommentPayloadSchema = <Status extends string>(status: Status) =>
  z
    .object({
      comment_id: eventResourceIdSchema,
      author_id: eventResourceIdSchema,
      status: z.literal(status),
      version: eventInt64StringSchema,
    })
    .strict();

const moderationDecisionPayloadSchema = z
  .object({
    case_id: eventResourceIdSchema,
    target_type: z.enum(["post", "comment", "actor"]),
    target_id: eventResourceIdSchema,
    action: z.enum(["approve", "reject", "hide", "restore", "suspend"]),
    decision_version: eventInt64StringSchema,
  })
  .strict();

const reactionChangedPayloadSchema = z
  .object({
    actor_id: eventResourceIdSchema,
    target_type: z.enum(["post", "comment"]),
    target_id: eventResourceIdSchema,
    active: z.boolean(),
  })
  .strict();

const watchlistItemChangedPayloadSchema = z
  .object({
    user_id: eventResourceIdSchema,
    listing_id: eventResourceIdSchema,
    present: z.boolean(),
  })
  .strict();

const notificationCreatedPayloadSchema = z
  .object({
    notification_id: eventResourceIdSchema,
    recipient_id: eventResourceIdSchema,
    canonical_key: safeCodeSchema,
    get deep_link() {
      return approvedDeepLinkSchema;
    },
  })
  .strict();

const notificationReadWatermarkPayloadSchema = z
  .object({
    recipient_id: eventResourceIdSchema,
    read_watermark: eventInt64StringSchema,
  })
  .strict();

const moderationReportPayloadSchema = z
  .object({
    report_id: eventResourceIdSchema,
    case_id: eventResourceIdSchema,
    reporter_id: eventResourceIdSchema,
    target_type: z.enum(["post", "comment"]),
    target_id: eventResourceIdSchema,
    reason_code: safeCodeSchema,
  })
  .strict();

const portfolioLedgerEntryPayloadSchema = z
  .object({
    portfolio_id: eventResourceIdSchema,
    ledger_entry_id: eventResourceIdSchema,
    committed_version: eventInt64StringSchema,
  })
  .strict();

const marketQuoteRevisedPayloadSchema = z
  .object({
    listing_id: eventResourceIdSchema,
    sequence: eventInt64StringSchema,
    revision: eventInt64StringSchema,
    as_of: eventTimestampSchema,
  })
  .strict();

export const eventPayloadSchemas = {
  "identity.user_registered": identityRegisteredPayloadSchema,
  "content.post_submitted": createPostPayloadSchema("submitted"),
  "moderation.decision_recorded": moderationDecisionPayloadSchema,
  "content.post_published": createPostPayloadSchema("published"),
  "content.post_hidden": createPostPayloadSchema("hidden"),
  "content.post_restored": createPostPayloadSchema("restored"),
  "identity.user_suspended": identitySuspendedPayloadSchema,
  "social.comment_submitted": createCommentPayloadSchema("submitted"),
  "social.comment_published": createCommentPayloadSchema("published"),
  "social.comment_hidden": createCommentPayloadSchema("hidden"),
  "social.comment_restored": createCommentPayloadSchema("restored"),
  "social.reaction_changed": reactionChangedPayloadSchema,
  "watchlist.item_changed": watchlistItemChangedPayloadSchema,
  "notification.created": notificationCreatedPayloadSchema,
  "notification.read_watermark_advanced":
    notificationReadWatermarkPayloadSchema,
  "moderation.report_submitted": moderationReportPayloadSchema,
  "portfolio.ledger_entry_posted": portfolioLedgerEntryPayloadSchema,
  "market.quote_revised": marketQuoteRevisedPayloadSchema,
} as const;
