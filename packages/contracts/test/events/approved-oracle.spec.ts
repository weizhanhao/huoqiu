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
      expect(sequence.pattern, event.type).toBe("^(?:0|[1-9][0-9]{0,18})$");
      expect(sequence["x-int64-string"], event.type).toBe(true);
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
