import { describe, expect, it } from "vitest";

import {
  idempotencyHeaderSchema,
  idempotencyIfMatchHeaderSchema,
  ifMatchHeaderSchema,
  versionStringSchema,
} from "../src/m1/common.js";
import {
  notificationSseDataSchema,
  notificationSseFrameBatchSchema,
} from "../src/m1/notification-moderation.contract.js";
import { m1Router } from "../src/m1/router.js";

const standardRequestHeaders = {
  host: "api.internal.example",
  "content-type": "application/json",
  "user-agent": "huoqiu-contract-test/1.0",
} as const;

describe("M1 request transport boundaries", () => {
  it("allows standard request headers while requiring Idempotency-Key", () => {
    expect(
      idempotencyHeaderSchema.safeParse({
        ...standardRequestHeaders,
        "idempotency-key": "request-0001",
      }).success,
    ).toBe(true);
    expect(
      idempotencyHeaderSchema.safeParse(standardRequestHeaders).success,
    ).toBe(false);
  });

  it("allows standard request headers while requiring Idempotency-Key and If-Match", () => {
    expect(
      idempotencyIfMatchHeaderSchema.safeParse({
        ...standardRequestHeaders,
        "idempotency-key": "request-0001",
        "if-match": '"42"',
      }).success,
    ).toBe(true);
    expect(
      idempotencyIfMatchHeaderSchema.safeParse({
        ...standardRequestHeaders,
        "if-match": '"42"',
      }).success,
    ).toBe(false);
    expect(
      idempotencyIfMatchHeaderSchema.safeParse({
        ...standardRequestHeaders,
        "idempotency-key": "request-0001",
      }).success,
    ).toBe(false);
  });

  it("enforces canonical non-negative int64 strings without number coercion", () => {
    expect(versionStringSchema.safeParse("0").success).toBe(true);
    expect(versionStringSchema.safeParse("9223372036854775807").success).toBe(
      true,
    );
    expect(versionStringSchema.safeParse("9223372036854775808").success).toBe(
      false,
    );
    expect(versionStringSchema.safeParse("9".repeat(128)).success).toBe(false);
    expect(versionStringSchema.safeParse("01").success).toBe(false);
    expect(versionStringSchema.safeParse("-1").success).toBe(false);
    expect(
      versionStringSchema.safeParse(9_223_372_036_854_775_807n).success,
    ).toBe(false);
    expect(
      versionStringSchema.safeParse(Number("9223372036854775807")).success,
    ).toBe(false);
  });

  it("enforces the same int64 boundary inside strong If-Match entity tags", () => {
    expect(ifMatchHeaderSchema.safeParse({ "if-match": '"0"' }).success).toBe(
      true,
    );
    expect(
      ifMatchHeaderSchema.safeParse({
        ...standardRequestHeaders,
        "if-match": '"9223372036854775807"',
      }).success,
    ).toBe(true);
    expect(
      ifMatchHeaderSchema.safeParse({
        "if-match": '"9223372036854775808"',
      }).success,
    ).toBe(false);
    expect(
      ifMatchHeaderSchema.safeParse({ "if-match": `"${"9".repeat(128)}"` })
        .success,
    ).toBe(false);
    expect(ifMatchHeaderSchema.safeParse({ "if-match": '"01"' }).success).toBe(
      false,
    );
    expect(
      ifMatchHeaderSchema.safeParse({ "if-match": 'W/"42"' }).success,
    ).toBe(false);
  });
});

describe("M1 notification SSE wire contract", () => {
  const notificationEventData = {
    request_id: "request_1",
    trace_id: "trace_1",
    event: {
      id: "notification_1",
      sequence: "42",
      kind: "post_published",
      title: "Post published",
      body: "Your post is visible.",
      created_at: "2026-08-09T08:00:00Z",
      deep_link: "/posts/post_1",
    },
  } as const;
  const eventFrame = [
    "id: 42",
    "event: notification",
    `data: ${JSON.stringify(notificationEventData)}`,
    "",
    "",
  ].join("\n");
  const heartbeatFrame = ": heartbeat\n\n";
  const response = m1Router.notificationStream.responses[200];

  it("declares text/event-stream as a string wire stream, not a static object", () => {
    expect(response.contentType).toBe("text/event-stream");
    expect(response.body.safeParse(eventFrame).success).toBe(true);
    expect(response.body.safeParse(heartbeatFrame).success).toBe(true);
    expect(response.body.safeParse("id: 4").success).toBe(true);
    expect(response.body.safeParse(notificationEventData).success).toBe(false);
    expect(m1Router.notificationStream.metadata).toEqual({
      transport: "dedicated-sse",
      defaultTsRestClient: false,
      eventId: "non-negative-int64-string",
      dataSchema: "notificationSseDataSchema",
      frameSchema: "notificationSseFrameBatchSchema",
      heartbeatComment: ": heartbeat",
    });
    expect(m1Router.notificationStream.description).toMatch(
      /do not use the default ts-rest client/iu,
    );
  });

  it("requires notification id/data frame semantics and a valid heartbeat", () => {
    expect(
      notificationSseFrameBatchSchema.safeParse(
        `event: notification\ndata: ${JSON.stringify(notificationEventData)}\n\n`,
      ).success,
    ).toBe(false);
    expect(
      notificationSseFrameBatchSchema.safeParse(
        "id: 42\nevent: notification\n\n",
      ).success,
    ).toBe(false);
    expect(
      notificationSseFrameBatchSchema.safeParse(": not-a-heartbeat\n\n")
        .success,
    ).toBe(false);
    expect(
      notificationSseFrameBatchSchema.safeParse(
        `${eventFrame}${heartbeatFrame}`,
      ).success,
    ).toBe(true);
    expect(
      notificationSseFrameBatchSchema.safeParse(
        eventFrame.replaceAll("\n", "\r\n"),
      ).success,
    ).toBe(true);
    expect(
      notificationSseDataSchema.safeParse(notificationEventData).success,
    ).toBe(true);
    const mismatchedData = {
      ...notificationEventData,
      event: { ...notificationEventData.event, sequence: "43" },
    };
    expect(
      notificationSseFrameBatchSchema.safeParse(
        `id: 42\nevent: notification\ndata: ${JSON.stringify(mismatchedData)}\n\n`,
      ).success,
    ).toBe(false);
    expect(
      notificationSseFrameBatchSchema.safeParse(
        ": heartbeat\nid: 42\ndata: {}\n\n",
      ).success,
    ).toBe(false);
  });

  it("delivers the first frame through fetch streaming before the connection closes", async () => {
    const encoder = new TextEncoder();
    let closeStream: (() => void) | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(eventFrame));
        closeStream = () => controller.close();
      },
    });
    const fetchResponse = new Response(stream, {
      headers: { "content-type": "text/event-stream" },
    });
    const reader = fetchResponse.body?.getReader();

    expect(reader).toBeDefined();
    const firstRead = await reader?.read();
    expect(firstRead?.done).toBe(false);
    const firstFrame = new TextDecoder().decode(firstRead?.value);
    expect(notificationSseFrameBatchSchema.safeParse(firstFrame).success).toBe(
      true,
    );

    closeStream?.();
    expect((await reader?.read())?.done).toBe(true);
  });

  it("accepts standard headers and bounds Last-Event-ID as int64", () => {
    expect(
      m1Router.notificationStream.headers.safeParse({
        ...standardRequestHeaders,
        "last-event-id": "9223372036854775807",
      }).success,
    ).toBe(true);
    expect(
      m1Router.notificationStream.headers.safeParse({
        "last-event-id": "9223372036854775808",
      }).success,
    ).toBe(false);
  });
});
