import { initContract } from "@ts-rest/core";
import { z } from "zod";

import {
  commonErrorResponses,
  createListResponseSchema,
  cursorQuerySchema,
  decimalStringSchema,
  idempotencyHeaderSchema,
  requestMetaSchema,
  resourceIdSchema,
  timestampSchema,
  versionStringSchema,
} from "./common.js";

const c = initContract();

const portfolioPathSchema = z.object({ id: resourceIdSchema }).strict();

export const portfolioSchema = z
  .object({
    id: resourceIdSchema,
    owner_id: resourceIdSchema,
    name: z.string().min(1).max(120),
    currency: z.string().length(3),
    cash_balance: decimalStringSchema,
    version: versionStringSchema,
    created_at: timestampSchema,
  })
  .strict();

export const ledgerEntrySchema = z
  .object({
    id: resourceIdSchema,
    portfolio_id: resourceIdSchema,
    listing_id: resourceIdSchema.nullable(),
    kind: z.enum(["buy", "sell", "fee", "reversal"]),
    quantity: decimalStringSchema,
    price: decimalStringSchema,
    amount: decimalStringSchema,
    reverses_entry_id: resourceIdSchema.nullable(),
    committed_version: versionStringSchema,
    created_at: timestampSchema,
  })
  .strict();

export const positionSchema = z
  .object({
    listing_id: resourceIdSchema,
    quantity: decimalStringSchema,
    average_price: decimalStringSchema,
    market_price: decimalStringSchema,
    market_value: decimalStringSchema,
    valuation_as_of: timestampSchema,
    version: versionStringSchema,
  })
  .strict();

export const portfolioContract = c.router({
  portfolioListMine: {
    method: "GET",
    path: "/v1/me/portfolios",
    query: cursorQuerySchema,
    responses: {
      200: createListResponseSchema(portfolioSchema),
      ...commonErrorResponses,
    },
    summary: "List the actor's private portfolios",
  },
  portfolioCreate: {
    method: "POST",
    path: "/v1/portfolios",
    headers: idempotencyHeaderSchema,
    body: z
      .object({
        name: z.string().min(1).max(120),
        currency: z.string().length(3),
        opening_cash: decimalStringSchema,
      })
      .strict(),
    responses: {
      201: requestMetaSchema.extend({ portfolio: portfolioSchema }),
      ...commonErrorResponses,
    },
    summary: "Create a private portfolio",
  },
  portfolioGet: {
    method: "GET",
    path: "/v1/portfolios/:id",
    pathParams: portfolioPathSchema,
    responses: {
      200: requestMetaSchema.extend({ portfolio: portfolioSchema }),
      ...commonErrorResponses,
    },
    summary: "Read an owned private portfolio",
  },
  portfolioCreateLedgerEntry: {
    method: "POST",
    path: "/v1/portfolios/:id/ledger-entries",
    pathParams: portfolioPathSchema,
    headers: idempotencyHeaderSchema,
    body: z
      .object({
        listing_id: resourceIdSchema.nullable(),
        kind: z.enum(["buy", "sell", "fee"]),
        quantity: decimalStringSchema,
        price: decimalStringSchema,
        amount: decimalStringSchema,
        expected_version: versionStringSchema,
      })
      .strict(),
    responses: {
      201: requestMetaSchema.extend({ entry: ledgerEntrySchema }),
      ...commonErrorResponses,
    },
    summary: "Append a validated portfolio ledger entry",
  },
  portfolioCreateReversal: {
    method: "POST",
    path: "/v1/portfolios/:id/reversals",
    pathParams: portfolioPathSchema,
    headers: idempotencyHeaderSchema,
    body: z
      .object({
        entry_id: resourceIdSchema,
        reason: z.string().min(1).max(500),
        expected_version: versionStringSchema,
      })
      .strict(),
    responses: {
      201: requestMetaSchema.extend({ entry: ledgerEntrySchema }),
      ...commonErrorResponses,
    },
    summary: "Append a reversal without changing ledger history",
  },
  portfolioListPositions: {
    method: "GET",
    path: "/v1/portfolios/:id/positions",
    pathParams: portfolioPathSchema,
    query: z.object({ valuation_as_of: timestampSchema }).strict(),
    responses: {
      200: createListResponseSchema(positionSchema),
      ...commonErrorResponses,
    },
    summary: "List owned portfolio positions at a valuation time",
  },
  portfolioListLedgerEntries: {
    method: "GET",
    path: "/v1/portfolios/:id/ledger-entries",
    pathParams: portfolioPathSchema,
    query: cursorQuerySchema,
    responses: {
      200: createListResponseSchema(ledgerEntrySchema),
      ...commonErrorResponses,
    },
    summary: "List owned portfolio ledger entries",
  },
});
