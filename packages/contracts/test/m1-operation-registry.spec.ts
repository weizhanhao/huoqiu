import { describe, expect, it } from "vitest";

import {
  apiErrorSchema,
  decimalStringSchema,
  versionStringSchema,
} from "../src/m1/common.js";
import { m1OperationRegistry } from "../src/m1/operation-registry.js";
import { m1Router } from "../src/m1/router.js";

const approvedOperations = [
  ["API-AUTH-001", "authRegister", "POST", "/v1/auth/register"],
  ["API-AUTH-002", "authLogin", "POST", "/v1/auth/login"],
  ["API-AUTH-003", "authGetSession", "GET", "/v1/auth/session"],
  ["API-AUTH-004", "authLogout", "POST", "/v1/auth/logout"],
  ["API-INST-001", "instrumentSearch", "GET", "/v1/instruments/search"],
  ["API-INST-002", "listingGet", "GET", "/v1/listings/:id"],
  ["API-MD-001", "listingGetQuote", "GET", "/v1/listings/:id/quote"],
  ["API-MD-002", "listingGetBars", "GET", "/v1/listings/:id/bars"],
  ["API-FEED-001", "feedGet", "GET", "/v1/feed"],
  ["API-WATCH-001", "watchlistGetDefault", "GET", "/v1/me/watchlist"],
  [
    "API-WATCH-002",
    "watchlistPutItem",
    "PUT",
    "/v1/me/watchlist/items/:listingId",
  ],
  [
    "API-WATCH-003",
    "watchlistDeleteItem",
    "DELETE",
    "/v1/me/watchlist/items/:listingId",
  ],
  ["API-POST-001", "postCreate", "POST", "/v1/posts"],
  ["API-POST-002", "postGet", "GET", "/v1/posts/:id"],
  ["API-COMMENT-000", "commentList", "GET", "/v1/posts/:id/comments"],
  ["API-COMMENT-001", "commentCreate", "POST", "/v1/posts/:id/comments"],
  ["API-REACTION-001", "postPutLike", "PUT", "/v1/posts/:id/reactions/like"],
  [
    "API-REACTION-002",
    "postDeleteLike",
    "DELETE",
    "/v1/posts/:id/reactions/like",
  ],
  ["API-NOTIF-001", "notificationList", "GET", "/v1/me/notifications"],
  [
    "API-NOTIF-002",
    "notificationAdvanceReadWatermark",
    "POST",
    "/v1/me/notifications/read-watermark",
  ],
  ["API-NOTIF-003", "notificationStream", "GET", "/v1/me/events"],
  ["API-REPORT-001", "reportCreate", "POST", "/v1/reports"],
  ["API-MOD-001", "moderationCaseList", "GET", "/v1/admin/moderation/cases"],
  [
    "API-MOD-002",
    "moderationDecisionCreate",
    "POST",
    "/v1/admin/moderation/cases/:id/decisions",
  ],
  ["API-PORT-000", "portfolioListMine", "GET", "/v1/me/portfolios"],
  ["API-PORT-001", "portfolioCreate", "POST", "/v1/portfolios"],
  ["API-PORT-002", "portfolioGet", "GET", "/v1/portfolios/:id"],
  [
    "API-PORT-003",
    "portfolioCreateLedgerEntry",
    "POST",
    "/v1/portfolios/:id/ledger-entries",
  ],
  [
    "API-PORT-004",
    "portfolioCreateReversal",
    "POST",
    "/v1/portfolios/:id/reversals",
  ],
  [
    "API-PORT-005",
    "portfolioListPositions",
    "GET",
    "/v1/portfolios/:id/positions",
  ],
  [
    "API-PORT-006",
    "portfolioListLedgerEntries",
    "GET",
    "/v1/portfolios/:id/ledger-entries",
  ],
] as const;

describe("M1 operation registry", () => {
  it("contains exactly the approved M1 surface in canonical order", () => {
    expect(
      m1OperationRegistry.map(({ apiId, operationId, method, path }) => [
        apiId,
        operationId,
        method,
        path,
      ]),
    ).toEqual(approvedOperations);
    expect(m1OperationRegistry).toHaveLength(31);
    expect(new Set(m1OperationRegistry.map((item) => item.apiId)).size).toBe(
      31,
    );
    expect(
      new Set(m1OperationRegistry.map((item) => item.operationId)).size,
    ).toBe(31);
    expect(
      new Set(
        m1OperationRegistry.map(
          (item) =>
            `${item.apiId}|${item.operationId}|${item.method}|${item.path}`,
        ),
      ).size,
    ).toBe(31);
    expect(
      m1OperationRegistry.every(
        (item) =>
          item.capId.length > 0 &&
          item.action.length > 0 &&
          item.roles.length > 0 &&
          item.contract.length > 0,
      ),
    ).toBe(true);
  });

  it("binds every registry record to the matching ts-rest route", () => {
    for (const item of m1OperationRegistry) {
      const route = m1Router[item.operationId];

      expect(route, item.operationId).toBeDefined();
      expect(route.method).toBe(item.method);
      expect(route.path).toBe(item.path);
      expect(route.responses).toBeDefined();
    }

    expect(Object.keys(m1Router)).toHaveLength(31);
  });

  it("requires Idempotency-Key on every POST route", () => {
    const postOperations = m1OperationRegistry.filter(
      ({ method }) => method === "POST",
    );

    expect(postOperations).toHaveLength(11);
    for (const item of postOperations) {
      expect(item.mutation).toMatchObject({
        kind: "command",
        idempotencyKey: true,
      });
      const route = m1Router[item.operationId];
      if (!("headers" in route)) {
        throw new Error(`${item.operationId} has no header schema`);
      }
      expect(route.headers.safeParse({}).success, item.operationId).toBe(false);
      const validHeaders =
        "concurrency" in item.mutation
          ? {
              "idempotency-key": "request-0001",
              "if-match": '"42"',
            }
          : { "idempotency-key": "request-0001" };
      expect(
        route.headers.safeParse(validHeaders).success,
        item.operationId,
      ).toBe(true);
    }
  });

  it("uses deterministic resource keys for every PUT and DELETE", () => {
    const deterministicMutations = m1OperationRegistry.filter(
      ({ method }) => method === "PUT" || method === "DELETE",
    );

    expect(deterministicMutations).toHaveLength(4);
    for (const item of deterministicMutations) {
      expect(item.mutation).toMatchObject({
        kind: "deterministic-resource-key",
      });
      if (!("resourceKey" in item.mutation)) {
        throw new Error(
          `${item.operationId} has no deterministic resource key`,
        );
      }
      expect(item.mutation.resourceKey.length).toBeGreaterThan(0);
      expect(item.path).toContain(`:${item.mutation.resourceKey}`);
    }
  });

  it("declares optimistic concurrency for moderation decisions", () => {
    const operation = m1OperationRegistry.find(
      ({ apiId }) => apiId === "API-MOD-002",
    );

    expect(operation?.mutation).toMatchObject({
      kind: "command",
      idempotencyKey: true,
      concurrency: "if-match",
    });
    expect(
      m1Router.moderationDecisionCreate.headers.safeParse({
        "idempotency-key": "request-0001",
      }).success,
    ).toBe(false);
    expect(
      m1Router.moderationDecisionCreate.headers.safeParse({
        "idempotency-key": "request-0001",
        "if-match": '"42"',
      }).success,
    ).toBe(true);
  });

  it("references one shared safe error schema from every route", () => {
    for (const [operationId, route] of Object.entries(m1Router)) {
      const errorResponses = Object.entries(route.responses).filter(
        ([status]) => Number(status) >= 400,
      );

      expect(errorResponses.length, operationId).toBeGreaterThan(0);
      for (const [, responseSchema] of errorResponses) {
        expect(responseSchema, operationId).toBe(apiErrorSchema);
      }
    }

    const validError = {
      code: "VALIDATION_FAILED",
      message: "Input is invalid",
      details: { field: "query" },
      trace_id: "trace_1",
    } as const;
    expect(apiErrorSchema.safeParse(validError).success).toBe(true);
    expect(
      apiErrorSchema.safeParse({
        ...validError,
        message: "Error at handler (/srv/app/private.ts:42:7)",
      }).success,
    ).toBe(false);
    expect(
      apiErrorSchema.safeParse({
        ...validError,
        message: "SELECT password FROM users WHERE id = 1",
      }).success,
    ).toBe(false);
    expect(
      apiErrorSchema.safeParse({ ...validError, stack: "private stack" })
        .success,
    ).toBe(false);
  });

  it("uses decimal strings for quantities and int64 strings for versions", () => {
    expect(decimalStringSchema.safeParse("-12.50").success).toBe(true);
    expect(decimalStringSchema.safeParse(12.5).success).toBe(false);
    expect(decimalStringSchema.safeParse("1e6").success).toBe(false);
    expect(versionStringSchema.safeParse("9223372036854775807").success).toBe(
      true,
    );
    expect(versionStringSchema.safeParse(42).success).toBe(false);
    expect(versionStringSchema.safeParse("-1").success).toBe(false);
  });
});
