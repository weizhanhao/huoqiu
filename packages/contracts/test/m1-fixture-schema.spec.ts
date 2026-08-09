import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { m1FixtureSchema as rootFixtureSchema } from "@huoqiu/contracts";
import { m1FixtureSchema as m1FixtureEntrypointSchema } from "@huoqiu/contracts/m1";
import { m1FixtureSchema as fixtureSubpathSchema } from "@huoqiu/contracts/m1/fixture";

import { m1FixtureSchema } from "../src/m1/fixture-schema.js";

interface FixturePolicy {
  allowed_sources: string[];
  forbidden_pii_keys: string[];
  allowed_surfaces: string[];
}

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const fixtureDirectory = resolve(import.meta.dirname, "../fixtures");
const policyPath = "quality/oracles/m1/fixture-policy.v1.json";

const approvedHash = readFileSync(
  resolve(repositoryRoot, "quality/oracles/m1/approved.sha256"),
  "utf8",
)
  .trim()
  .split("\n")
  .map((line) => line.match(/^([a-f0-9]{64}) {2}(.+)$/u))
  .find((match) => match?.[2] === policyPath)?.[1];
const policyBytes = readFileSync(resolve(repositoryRoot, policyPath));
const actualHash = createHash("sha256").update(policyBytes).digest("hex");

if (approvedHash === undefined || actualHash !== approvedHash) {
  throw new Error(
    "M1 fixture policy does not match its independently approved SHA",
  );
}

const policy = JSON.parse(policyBytes.toString("utf8")) as FixturePolicy;

const loadJson = (relativePath: string): unknown =>
  JSON.parse(readFileSync(resolve(fixtureDirectory, relativePath), "utf8"));

const collectKeys = (value: unknown, keys = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
};

const collectStringValuesForKey = (
  value: unknown,
  targetKey: string,
  values = new Set<string>(),
): Set<string> => {
  if (Array.isArray(value)) {
    for (const item of value)
      collectStringValuesForKey(item, targetKey, values);
    return values;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === targetKey && typeof child === "string") values.add(child);
      collectStringValuesForKey(child, targetKey, values);
    }
  }
  return values;
};

const cloneRecord = (value: unknown): Record<string, unknown> =>
  structuredClone(value) as Record<string, unknown>;

describe("independently approved M1 fixture schema", () => {
  it("publishes one schema through every supported contracts entrypoint", () => {
    expect(rootFixtureSchema).toBe(m1FixtureSchema);
    expect(m1FixtureEntrypointSchema).toBe(m1FixtureSchema);
    expect(fixtureSubpathSchema).toBe(m1FixtureSchema);
  });

  it("accepts the deterministic synthetic fixture and exact approved registries", () => {
    const fixture = loadJson("m1.v1.json");
    const parsed = m1FixtureSchema.parse(fixture);
    const forbiddenKeys = new Set(policy.forbidden_pii_keys);

    expect(actualHash).toBe(approvedHash);
    expect([...collectStringValuesForKey(parsed, "source")]).toEqual(
      policy.allowed_sources,
    );
    expect(parsed.surfaces).toEqual(policy.allowed_surfaces);
    expect(
      [...collectKeys(parsed)].filter((key) => forbiddenKeys.has(key)),
    ).toEqual([]);
    expect(parsed.identities.employees).toMatchObject([
      { subject_id: "subject_syn_0001", roles: ["Reviewer"] },
      { subject_id: "subject_syn_0002", roles: ["Operator"] },
    ]);
    expect(parsed.market).toMatchObject({
      exchange: { exchange_id: "exchange_syn_0001" },
      listing: { listing_id: "listing_syn_0001" },
    });
    expect(parsed.registries.default_channel_id).toBe("home");
    expect(
      parsed.registries.channels.map(({ channel_id }) => channel_id),
    ).toEqual(["home", "following", "market", "news"]);
    expect(parsed.registries.cards.map(({ card_type }) => card_type)).toEqual([
      "post",
      "news",
      "market_strip",
      "topic",
      "ops_banner",
    ]);
    expect(parsed).toEqual(fixture);
  });

  it("rejects email, token, and real-name PII from the dedicated negative fixture", () => {
    const fixture = loadJson("negative/m1-pii-email.json");
    const forbiddenKeys = new Set(policy.forbidden_pii_keys);
    const detected = [...collectKeys(fixture)]
      .filter((key) => forbiddenKeys.has(key))
      .toSorted();

    expect(detected).toEqual(["email", "real_name", "token"]);
    expect(m1FixtureSchema.safeParse(fixture).success).toBe(false);

    const repaired = cloneRecord(fixture);
    const identities = repaired.identities as {
      employees: Record<string, unknown>[];
    };
    delete identities.employees[0]?.email;
    delete identities.employees[0]?.real_name;
    delete identities.employees[0]?.token;
    expect(m1FixtureSchema.safeParse(repaired).success).toBe(true);
  });

  it("rejects a source that the independent policy did not approve", () => {
    const fixture = loadJson("negative/m1-unauthorized-source.json");
    const sources = [...collectStringValuesForKey(fixture, "source")];

    expect(
      sources.filter((source) => !policy.allowed_sources.includes(source)),
    ).toEqual(["unapproved-live-vendor"]);
    expect(m1FixtureSchema.safeParse(fixture).success).toBe(false);

    const repaired = cloneRecord(fixture);
    repaired.source = policy.allowed_sources[0];
    expect(m1FixtureSchema.safeParse(repaired).success).toBe(true);
  });

  it("rejects every disabled private-fund, trade, public-portfolio, push, and AI-advice surface", () => {
    const fixture = loadJson("negative/m1-forbidden-surface.json") as {
      surfaces: string[];
    };
    const disallowed = fixture.surfaces.filter(
      (surface) => !policy.allowed_surfaces.includes(surface),
    );

    expect(disallowed).toEqual([
      "private_fund",
      "trade",
      "public_portfolio",
      "push",
      "ai_advice",
    ]);
    expect(m1FixtureSchema.safeParse(fixture).success).toBe(false);

    const repaired = cloneRecord(fixture);
    repaired.surfaces = policy.allowed_surfaces;
    expect(m1FixtureSchema.safeParse(repaired).success).toBe(true);
  });
});
