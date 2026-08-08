import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  apiErrorCodeSchema,
  apiErrorSchema,
  createCursorPageSchema,
  cursorSchema,
  errorCodes,
} from "../src/index.js";

const validApiError = {
  code: "VALIDATION_FAILED",
  message: "输入不合法",
  details: { field: "query" },
  trace_id: "trace_test_1",
} as const;

describe("shared API error contract", () => {
  it("parses the approved API error example", () => {
    expect(apiErrorSchema.parse(validApiError).code).toBe("VALIDATION_FAILED");
  });

  it("contains exactly the approved error codes in canonical order", () => {
    expect(errorCodes).toEqual([
      "AUTH_REQUIRED",
      "SESSION_EXPIRED",
      "FORBIDDEN",
      "NOT_FOUND",
      "VALIDATION_FAILED",
      "CONFLICT",
      "RATE_LIMITED",
      "DATA_STALE",
      "DATA_UNAVAILABLE",
      "ENTITLEMENT_DENIED",
      "CONTENT_UNAVAILABLE",
      "LEDGER_INVARIANT_FAILED",
      "STREAM_CURSOR_EXPIRED",
    ]);
    expect(new Set(errorCodes).size).toBe(13);
  });

  it("rejects unknown error codes", () => {
    expect(() =>
      apiErrorCodeSchema.parse("UNAPPROVED_INTERNAL_FAILURE"),
    ).toThrow();
    expect(() =>
      apiErrorSchema.parse({ ...validApiError, code: "INTERNAL_ERROR" }),
    ).toThrow();
  });

  it.each(["stack", "sql", "path", "token", "vendor_secret", "arbitrary"])(
    "rejects forbidden details key %s",
    (key) => {
      expect(() =>
        apiErrorSchema.parse({
          ...validApiError,
          details: { ...validApiError.details, [key]: "sensitive" },
        }),
      ).toThrow();
    },
  );

  it.each(["stack", "internal", "exception"])(
    "rejects forbidden top-level key %s",
    (key) => {
      expect(() =>
        apiErrorSchema.parse({ ...validApiError, [key]: "sensitive" }),
      ).toThrow();
    },
  );

  it("bounds public detail values without exposing internal paths", () => {
    expect(
      apiErrorSchema.parse({
        ...validApiError,
        details: {
          field: "portfolio.version",
          constraint: "version_conflict",
          retry_after: 0,
          conflict_version: "42",
        },
      }).details,
    ).toEqual({
      field: "portfolio.version",
      constraint: "version_conflict",
      retry_after: 0,
      conflict_version: "42",
    });

    expect(() =>
      apiErrorSchema.parse({
        ...validApiError,
        details: { retry_after: -1 },
      }),
    ).toThrow();
    expect(() =>
      apiErrorSchema.parse({
        ...validApiError,
        details: { retry_after: 86_401 },
      }),
    ).toThrow();
    expect(() =>
      apiErrorSchema.parse({
        ...validApiError,
        details: { conflict_version: "-1" },
      }),
    ).toThrow();
    expect(() =>
      apiErrorSchema.parse({
        ...validApiError,
        details: { field: "/srv/private/query" },
      }),
    ).toThrow();
  });

  it("requires all four bounded top-level fields", () => {
    expect(() =>
      apiErrorSchema.parse({
        code: validApiError.code,
        message: validApiError.message,
        details: validApiError.details,
      }),
    ).toThrow();
    expect(() =>
      apiErrorSchema.parse({ ...validApiError, message: "x".repeat(257) }),
    ).toThrow();
    expect(() =>
      apiErrorSchema.parse({ ...validApiError, trace_id: "x".repeat(129) }),
    ).toThrow();
  });
});

describe("opaque cursor contract", () => {
  it("accepts bounded opaque tokens without exposing a decoded structure", () => {
    const value = "opaque.v1/segment?payload=uninterpreted";

    expect(cursorSchema.parse(value)).toBe(value);
    expect(cursorSchema.parse("x".repeat(512))).toHaveLength(512);
  });

  it.each(["", "   ", "line\nbreak", "nul\0byte"])(
    "rejects invalid cursor %j",
    (value) => {
      expect(() => cursorSchema.parse(value)).toThrow();
    },
  );

  it("rejects oversized and non-string cursors", () => {
    expect(() => cursorSchema.parse("x".repeat(513))).toThrow();
    expect(() => cursorSchema.parse(42)).toThrow();
  });
});

describe("cursor page contract", () => {
  const itemSchema = z.object({ id: z.string().min(1) }).strict();
  const pageSchema = createCursorPageSchema(itemSchema);

  it("parses strict cursor pages with nullable continuation", () => {
    expect(
      pageSchema.parse({ items: [{ id: "item_1" }], next_cursor: "next" }),
    ).toEqual({ items: [{ id: "item_1" }], next_cursor: "next" });
    expect(pageSchema.parse({ items: [], next_cursor: null })).toEqual({
      items: [],
      next_cursor: null,
    });
  });

  it("rejects extra page and item fields", () => {
    expect(() =>
      pageSchema.parse({ items: [], next_cursor: null, total: 0 }),
    ).toThrow();
    expect(() =>
      pageSchema.parse({
        items: [{ id: "item_1", internal_offset: 1 }],
        next_cursor: null,
      }),
    ).toThrow();
  });
});
