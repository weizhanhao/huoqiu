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
  safeDeepLinkSchema,
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
    deep_link: safeDeepLinkSchema.nullable(),
  })
  .strict();

export const notificationSseDataSchema = requestMetaSchema.extend({
  event: notificationSchema,
});

const addSseIssue = (
  context: z.RefinementCtx,
  message: string,
  frameIndex?: number,
): void => {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: frameIndex === undefined ? [] : [frameIndex],
    message,
  });
};

export const notificationSseFrameBatchSchema = z
  .string()
  .min(1)
  .superRefine((wireValue, context) => {
    const normalized = wireValue.replaceAll("\r\n", "\n");
    if (!normalized.endsWith("\n\n")) {
      addSseIssue(context, "SSE wire value must end with a complete frame");
      return;
    }

    const frames = normalized.slice(0, -2).split("\n\n");
    for (const [frameIndex, frame] of frames.entries()) {
      if (frame === ": heartbeat") {
        continue;
      }

      const lines = frame.split("\n");
      if (
        lines.length !== 3 ||
        !lines[0]?.startsWith("id: ") ||
        lines[1] !== "event: notification" ||
        !lines[2]?.startsWith("data: ")
      ) {
        addSseIssue(
          context,
          "Notification SSE frame requires id, event, and data lines",
          frameIndex,
        );
        continue;
      }

      const eventId = lines[0].slice("id: ".length);
      if (!versionStringSchema.safeParse(eventId).success) {
        addSseIssue(
          context,
          "SSE event id must be an int64 string",
          frameIndex,
        );
        continue;
      }

      let data: unknown;
      try {
        data = JSON.parse(lines[2].slice("data: ".length));
      } catch {
        addSseIssue(context, "SSE data must be valid JSON", frameIndex);
        continue;
      }

      const parsedData = notificationSseDataSchema.safeParse(data);
      if (!parsedData.success) {
        addSseIssue(
          context,
          "SSE data must match the notification event schema",
          frameIndex,
        );
        continue;
      }
      if (parsedData.data.event.sequence !== eventId) {
        addSseIssue(
          context,
          "SSE event id must equal notification sequence",
          frameIndex,
        );
      }
    }
  })
  .describe(
    "One or more complete notification id/event/data or ': heartbeat' SSE frames",
  );

export const notificationSseWireSchema = z
  .string()
  .describe(
    "Raw UTF-8 SSE wire bytes decoded as text; chunks may end at arbitrary boundaries and complete frames are validated separately",
  );

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
      .passthrough(),
    query: z.object({ cursor: z.string().min(1).max(512).optional() }).strict(),
    responses: {
      200: c.otherResponse({
        contentType: "text/event-stream",
        body: notificationSseWireSchema,
      }),
      ...commonErrorResponses,
    },
    summary: "Resume the recipient notification event stream",
    description:
      "Use a dedicated EventSource or raw-fetch streaming transport; do not use the default ts-rest client because it buffers text until the connection closes. Notification frames carry id/event/data and heartbeat comments are emitted every 20 seconds.",
    metadata: {
      transport: "dedicated-sse",
      defaultTsRestClient: false,
      eventId: "non-negative-int64-string",
      dataSchema: "notificationSseDataSchema",
      frameSchema: "notificationSseFrameBatchSchema",
      heartbeatComment: ": heartbeat",
    },
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
