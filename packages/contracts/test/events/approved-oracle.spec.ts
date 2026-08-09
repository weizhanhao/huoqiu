import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { z } from "zod4";
import { beforeAll, describe, expect, it } from "vitest";

import { eventRegistry } from "../../src/events/index.js";

interface ApprovedEvent {
  readonly event_type: string;
  readonly producer: string;
  readonly version: 1;
}

type JsonValue = boolean | null | number | string | JsonValue[] | JsonObject;
interface JsonObject {
  readonly [key: string]: JsonValue;
}

const payloadFieldsByEventType: Readonly<Record<string, readonly string[]>> = {
  "identity.user_registered": ["user_id", "reason", "effective_at"],
  "content.post_submitted": ["post_id", "author_id", "status", "version"],
  "moderation.decision_recorded": [
    "case_id",
    "target_type",
    "target_id",
    "action",
    "decision_version",
  ],
  "content.post_published": ["post_id", "author_id", "status", "version"],
  "content.post_hidden": ["post_id", "author_id", "status", "version"],
  "content.post_restored": ["post_id", "author_id", "status", "version"],
  "identity.user_suspended": ["user_id", "reason", "effective_at"],
  "social.comment_submitted": ["comment_id", "author_id", "status", "version"],
  "social.comment_published": ["comment_id", "author_id", "status", "version"],
  "social.comment_hidden": ["comment_id", "author_id", "status", "version"],
  "social.comment_restored": ["comment_id", "author_id", "status", "version"],
  "social.reaction_changed": ["actor_id", "target_type", "target_id", "active"],
  "watchlist.item_changed": ["user_id", "listing_id", "present"],
  "notification.created": [
    "notification_id",
    "recipient_id",
    "canonical_key",
    "deep_link",
  ],
  "notification.read_watermark_advanced": ["recipient_id", "read_watermark"],
  "moderation.report_submitted": [
    "report_id",
    "case_id",
    "reporter_id",
    "target_type",
    "target_id",
    "reason_code",
  ],
  "portfolio.ledger_entry_posted": [
    "portfolio_id",
    "ledger_entry_id",
    "committed_version",
  ],
  "market.quote_revised": ["listing_id", "sequence", "revision", "as_of"],
};

const int64PayloadFieldsByEventType: Readonly<
  Partial<Record<string, readonly string[]>>
> = {
  "content.post_submitted": ["version"],
  "moderation.decision_recorded": ["decision_version"],
  "content.post_published": ["version"],
  "content.post_hidden": ["version"],
  "content.post_restored": ["version"],
  "social.comment_submitted": ["version"],
  "social.comment_published": ["version"],
  "social.comment_hidden": ["version"],
  "social.comment_restored": ["version"],
  "notification.read_watermark_advanced": ["read_watermark"],
  "portfolio.ledger_entry_posted": ["committed_version"],
  "market.quote_revised": ["sequence", "revision"],
};

const forbiddenPayloadKeys = [
  "email",
  "token",
  "body",
  "text",
  "content",
  "evidence",
  "rationale",
  "trade",
  "private_fund",
  "payment",
  "push",
  "ai_advice",
] as const;

const approvedArtifactDeepLinks = [
  "/",
  "/login",
  "/search",
  "/watchlist",
  "/compose",
  "/notifications",
  "/portfolios",
  "/instruments/listing_US_AAPL",
  "/instruments/listing%5FUS%5FAAPL",
  "/posts/post_01J00000000000000000000000",
  "/posts/post%3A01J00000000000000000000000",
  "/portfolios/portfolio_01J00000000000000000000000",
  `/posts/${"a".repeat(128)}`,
  `/posts/${"%41".repeat(128)}`,
  `/search?q=${"a".repeat(120)}`,
  "huoqiu://home",
  "huoqiu://login",
  "huoqiu://search",
  "huoqiu://watchlist",
  "huoqiu://compose",
  "huoqiu://notifications",
  "huoqiu://portfolios",
  "huoqiu://instrument/listing_US_AAPL",
  "huoqiu://instrument/listing%5FUS%5FAAPL",
  "huoqiu://post/post_01J00000000000000000000000",
  "huoqiu://post/post%3A01J00000000000000000000000",
  "huoqiu://portfolio/portfolio_01J00000000000000000000000",
  `huoqiu://search?q=${"a".repeat(120)}`,
  null,
] as const;

const rejectedArtifactDeepLinks = [
  "https://evil.example/phish",
  "//evil.example/phish",
  "/login\n",
  "/search?q=",
  "/%2fevil.example/phish",
  "/%252fevil.example/phish",
  "/posts/%2e%2e",
  "/posts/%252e%252e",
  `/posts/${"a".repeat(129)}`,
  `/posts/${"%41".repeat(129)}`,
  `/search?q=${"a".repeat(121)}`,
  "huoqiu://search?q=",
  `huoqiu://search?q=${"a".repeat(121)}`,
  "huoqiu://trade/order_1",
  "huoqiu://admin/moderation",
] as const;

const contractsDirectory = resolve(import.meta.dirname, "../..");
const repositoryRoot = resolve(contractsDirectory, "../..");
const oracleDirectory = resolve(repositoryRoot, "quality/oracles/m1");
const eventSchemaDirectory = process.env.EVENT_SCHEMA_CANDIDATE_DIR
  ? resolve(process.env.EVENT_SCHEMA_CANDIDATE_DIR)
  : resolve(contractsDirectory, "events");
const oraclePath = "quality/oracles/m1/event-types.v1.json";

const readApprovedHash = (): string => {
  const manifest = readFileSync(
    resolve(oracleDirectory, "approved.sha256"),
    "utf8",
  );
  for (const line of manifest.trim().split("\n")) {
    const match = line.match(/^([a-f0-9]{64}) {2}(.+)$/u);
    if (match?.[2] === oraclePath && match[1] !== undefined) {
      return match[1];
    }
  }
  throw new Error(`No approved hash for ${oraclePath}`);
};

const requireObject = (value: unknown, label: string): JsonObject => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as JsonObject;
};

const requireStringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`${label} must be a string array`);
  }
  return value;
};

const clone = <T>(value: T): T => structuredClone(value);

const compareKeys = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const expectDeepSortedKeys = (value: JsonValue, location = "$"): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      expectDeepSortedKeys(item, `${location}[${index}]`),
    );
    return;
  }
  if (typeof value !== "object" || value === null) return;

  const keys = Object.keys(value);
  expect(keys, location).toEqual([...keys].sort(compareKeys));
  for (const [key, child] of Object.entries(value)) {
    expectDeepSortedKeys(child, `${location}.${key}`);
  }
};

const fileNameFor = (eventType: string): string =>
  `${eventType}.v1.schema.json`;

let approvedEvents: readonly ApprovedEvent[];

beforeAll(() => {
  const oracleBytes = readFileSync(resolve(repositoryRoot, oraclePath));
  const actualHash = createHash("sha256").update(oracleBytes).digest("hex");
  expect(actualHash).toBe(readApprovedHash());
  approvedEvents = JSON.parse(
    oracleBytes.toString("utf8"),
  ) as readonly ApprovedEvent[];
});

describe("approved M1 event schema artifacts", () => {
  it("matches every registry declaration to the independently approved oracle", () => {
    expect(
      eventRegistry.map(({ type, producer, version }) => ({
        event_type: type,
        producer,
        version,
      })),
    ).toEqual(approvedEvents);
    expect(Object.keys(payloadFieldsByEventType).sort()).toEqual(
      eventRegistry.map((event) => event.type).sort(),
    );
  });

  it("contains exactly one deterministic Draft 2020-12 schema per approved event", () => {
    const expectedFiles = approvedEvents
      .map((event) => fileNameFor(event.event_type))
      .sort(compareKeys);
    const actualFiles = readdirSync(eventSchemaDirectory)
      .filter((fileName) => fileName.endsWith(".json"))
      .sort(compareKeys);
    expect(actualFiles).toEqual(expectedFiles);

    for (const event of eventRegistry) {
      const path = resolve(eventSchemaDirectory, fileNameFor(event.type));
      const bytes = readFileSync(path, "utf8");
      const document = requireObject(JSON.parse(bytes), event.type);

      expect(document.$schema, event.type).toBe(
        "https://json-schema.org/draft/2020-12/schema",
      );
      expect(document.$id, event.type).toBe(
        `urn:huoqiu:event:${event.type}:v1`,
      );
      expect(document.title, event.type).toBe(`Huoqiu event ${event.type} v1`);
      expect(document["x-event-type"], event.type).toBe(event.type);
      expect(document["x-producer"], event.type).toBe(event.producer);
      expect(document["x-version"], event.type).toBe(1);
      expect(bytes, event.type).not.toContain(repositoryRoot);
      expect(bytes, event.type).not.toMatch(
        /\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u,
      );
      expectDeepSortedKeys(document);

      const roundTripSchema = z.fromJSONSchema(document);
      expect(roundTripSchema.safeParse(event.sample).success, event.type).toBe(
        true,
      );

      const properties = requireObject(document.properties, "properties");
      const sequence = requireObject(properties.sequence, "sequence");
      expect(sequence.type, event.type).toBe("string");
      expect(sequence["x-int64-string"], event.type).toBe(true);

      const maximumEnvelope = clone(event.sample);
      maximumEnvelope.sequence = "9223372036854775807";
      expect(
        roundTripSchema.safeParse(maximumEnvelope).success,
        `${event.type}:envelope.sequence maximum`,
      ).toBe(true);

      const overflowEnvelope = clone(event.sample);
      overflowEnvelope.sequence = "9223372036854775808";
      expect(
        roundTripSchema.safeParse(overflowEnvelope).success,
        `${event.type}:envelope.sequence overflow`,
      ).toBe(false);

      const newlineEnvelope = clone(event.sample);
      newlineEnvelope.sequence = "1\n";
      expect(
        roundTripSchema.safeParse(newlineEnvelope).success,
        `${event.type}:envelope.sequence trailing newline`,
      ).toBe(false);

      const payloadSchema = requireObject(properties.payload, "payload");
      const payloadProperties = requireObject(
        payloadSchema.properties,
        "payload.properties",
      );
      expect(Object.keys(payloadProperties).sort(), event.type).toEqual(
        [...(payloadFieldsByEventType[event.type] ?? [])].sort(),
      );
      expect(
        requireStringArray(payloadSchema.required, "payload.required").sort(),
        event.type,
      ).toEqual([...(payloadFieldsByEventType[event.type] ?? [])].sort());
      expect(payloadSchema.additionalProperties, event.type).toBe(false);

      for (const forbiddenKey of forbiddenPayloadKeys) {
        const withForbiddenKey = clone(event.sample);
        (withForbiddenKey.payload as Record<string, unknown>)[forbiddenKey] =
          "must-not-cross-the-event-boundary";
        expect(
          roundTripSchema.safeParse(withForbiddenKey).success,
          `${event.type}:payload.${forbiddenKey}`,
        ).toBe(false);
      }

      for (const field of int64PayloadFieldsByEventType[event.type] ?? []) {
        const overflowPayload = clone(event.sample);
        (overflowPayload.payload as Record<string, unknown>)[field] =
          "9223372036854775808";
        expect(
          roundTripSchema.safeParse(overflowPayload).success,
          `${event.type}:payload.${field} overflow`,
        ).toBe(false);
      }
    }
  });

  it("preserves the approved deep-link boundary in the generated schema", () => {
    const notification = eventRegistry.find(
      (event) => event.type === "notification.created",
    );
    expect(notification).toBeDefined();
    if (notification === undefined) return;

    const path = resolve(
      eventSchemaDirectory,
      fileNameFor("notification.created"),
    );
    const document = requireObject(
      JSON.parse(readFileSync(path, "utf8")),
      path,
    );
    const roundTripSchema = z.fromJSONSchema(document);

    for (const deepLink of approvedArtifactDeepLinks) {
      const approved = clone(notification.sample);
      (approved.payload as Record<string, unknown>).deep_link = deepLink;
      expect(
        roundTripSchema.safeParse(approved).success,
        `approved deep link: ${String(deepLink)}`,
      ).toBe(true);
    }
    for (const deepLink of rejectedArtifactDeepLinks) {
      const rejected = clone(notification.sample);
      (rejected.payload as Record<string, unknown>).deep_link = deepLink;
      expect(
        roundTripSchema.safeParse(rejected).success,
        `rejected deep link: ${deepLink}`,
      ).toBe(false);
    }
  });

  it("checks canonical bytes through an internal temporary directory", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/generate-events.mts", "--check"],
      {
        cwd: contractsDirectory,
        encoding: "utf8",
        env: process.env,
      },
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("EVENT_SCHEMA_CHECK PASS count=18");
  });
});
