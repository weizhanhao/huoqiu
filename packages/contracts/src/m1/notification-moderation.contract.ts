import { initContract } from "@ts-rest/core";
import { z } from "zod";

import {
  commonErrorResponses,
  createListResponseSchema,
  cursorQuerySchema,
  idempotencyHeaderSchema,
  idempotencyIfMatchHeaderSchema,
  requestMetaSchema,
  resourceIdSchema,
  timestampSchema,
  versionStringSchema,
} from "./common.js";

const c = initContract();

export const notificationSchema = z
  .object({
    id: resourceIdSchema,
    sequence: versionStringSchema,
    kind: z.string().min(1).max(64),
    title: z.string().min(1).max(160),
    body: z.string().min(1).max(500),
    created_at: timestampSchema,
    deep_link: z.string().min(1).max(512).nullable(),
  })
  .strict();

export const moderationCaseSchema = z
  .object({
    id: resourceIdSchema,
    target_type: z.enum(["post", "comment", "actor"]),
    target_id: resourceIdSchema,
    status: z.enum(["open", "approved", "rejected", "hidden", "restored"]),
    evidence_summary: z.string().min(1).max(1_000),
    version: versionStringSchema,
    created_at: timestampSchema,
  })
  .strict();

const moderationDecisionSchema = z
  .object({
    id: resourceIdSchema,
    case_id: resourceIdSchema,
    decision: z.enum(["approve", "reject", "hide", "restore", "ban"]),
    rationale: z.string().min(1).max(1_000),
    committed_version: versionStringSchema,
    created_at: timestampSchema,
  })
  .strict();

export const notificationModerationContract = c.router({
  notificationList: {
    method: "GET",
    path: "/v1/me/notifications",
    query: cursorQuerySchema,
    responses: {
      200: createListResponseSchema(notificationSchema),
      ...commonErrorResponses,
    },
    summary: "List notifications for the current recipient",
  },
  notificationAdvanceReadWatermark: {
    method: "POST",
    path: "/v1/me/notifications/read-watermark",
    headers: idempotencyHeaderSchema,
    body: z.object({ sequence: versionStringSchema }).strict(),
    responses: {
      200: requestMetaSchema.extend({ sequence: versionStringSchema }),
      ...commonErrorResponses,
    },
    summary: "Monotonically advance the notification read watermark",
  },
  notificationStream: {
    method: "GET",
    path: "/v1/me/events",
    headers: z
      .object({
        "last-event-id": versionStringSchema.optional(),
      })
      .strict(),
    query: z.object({ cursor: z.string().min(1).max(512).optional() }).strict(),
    responses: {
      200: c.otherResponse({
        contentType: "text/event-stream",
        body: requestMetaSchema.extend({
          event: notificationSchema,
        }),
      }),
      ...commonErrorResponses,
    },
    summary: "Resume the recipient notification event stream",
  },
  reportCreate: {
    method: "POST",
    path: "/v1/reports",
    headers: idempotencyHeaderSchema,
    body: z
      .object({
        target_type: z.enum(["post", "comment"]),
        target_id: resourceIdSchema,
        reason: z.string().min(1).max(500),
      })
      .strict(),
    responses: {
      201: requestMetaSchema.extend({
        report_id: resourceIdSchema,
        case_id: resourceIdSchema,
      }),
      ...commonErrorResponses,
    },
    summary: "Report visible content",
  },
  moderationCaseList: {
    method: "GET",
    path: "/v1/admin/moderation/cases",
    query: cursorQuerySchema.extend({
      status: z
        .enum(["open", "approved", "rejected", "hidden", "restored"])
        .optional(),
    }),
    responses: {
      200: createListResponseSchema(moderationCaseSchema),
      ...commonErrorResponses,
    },
    summary: "List moderation cases and evidence summaries",
  },
  moderationDecisionCreate: {
    method: "POST",
    path: "/v1/admin/moderation/cases/:id/decisions",
    pathParams: z.object({ id: resourceIdSchema }).strict(),
    headers: idempotencyIfMatchHeaderSchema,
    body: z
      .object({
        decision: z.enum(["approve", "reject", "hide", "restore", "ban"]),
        rationale: z.string().min(1).max(1_000),
      })
      .strict(),
    responses: {
      201: requestMetaSchema.extend({ decision: moderationDecisionSchema }),
      ...commonErrorResponses,
    },
    summary: "Record a version-matched moderation decision",
  },
});
