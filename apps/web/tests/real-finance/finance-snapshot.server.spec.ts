import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadFinancePublicViewModel,
  loadRuntimeFinancePublicViewModel,
  toFinancePublicViewModel,
} from "../../src/features/real-finance/finance-snapshot.server";

const temporaryDirectories: string[] = [];

const descriptor = (source: "sec-edgar" | "gdelt-gkg" | "nbs-cn-releases") => ({
  source,
  sourceMode: "real" as const,
  entitlement: source === "sec-edgar" ? "public-filings" : null,
  license:
    source === "sec-edgar"
      ? "sec-public-filings"
      : source === "gdelt-gkg"
        ? "gdelt-public-dataset"
        : "nbs-open-data",
  delaySeconds: source === "gdelt-gkg" ? 900 : 0,
  capabilities: [
    source === "sec-edgar"
      ? ("filing" as const)
      : source === "gdelt-gkg"
        ? ("news" as const)
        : ("macro" as const),
  ],
  licenseUrl:
    source === "sec-edgar"
      ? "https://www.sec.gov/about/privacy-information"
      : source === "gdelt-gkg"
        ? "https://www.gdeltproject.org/about.html"
        : "https://www.stats.gov.cn/wzgl/202302/t20230217_1912857.html",
  licenseScope:
    source === "sec-edgar"
      ? ("public-reuse" as const)
      : source === "gdelt-gkg"
        ? ("metadata-linkout-only" as const)
        : ("open-attribution" as const),
  externalDisplayAllowed: true,
  bodyStorageAllowed: false,
  imageStorageAllowed: false,
  redistributionAllowed: false,
  transformationAllowed: false,
  attributionRequired: true,
  attribution:
    source === "sec-edgar"
      ? "Source: SEC EDGAR"
      : source === "gdelt-gkg"
        ? "元数据来自 GDELT；原文权利归发布者"
        : "来源：国家统计局官方网站",
  licenseVerifiedAt: "2026-08-12T00:00:00.000Z",
  termsVerifiedAt: "2026-08-12T00:00:00.000Z",
  licenseSnapshotId: `${source}-policy-2026-08-12`,
  officialSource: source !== "gdelt-gkg",
  authType: "none" as const,
  market: source === "nbs-cn-releases" ? ("cn" as const) : ("global" as const),
  languages: source === "gdelt-gkg" ? (["en"] as const) : (["zh-CN"] as const),
  historyStartAt: "1994-01-01T00:00:00.000Z",
  nativeCadenceSeconds:
    source === "sec-edgar" ? 300 : source === "gdelt-gkg" ? 900 : 3_600,
  minPollIntervalSeconds: source === "sec-edgar" ? 1 : 300,
  staleAfterSeconds:
    source === "sec-edgar" ? 900 : source === "gdelt-gkg" ? 1_800 : 7_200,
  documentedRateLimit: { status: "unknown" as const },
  configuredRateLimit: { requests: 1, perSeconds: 5 },
  robotsPolicy: "not-applicable" as const,
  robotsCheckedAt: null,
  robotsUrl: null,
  transportSecurity: "https" as const,
  transportKind:
    source === "gdelt-gkg" ? ("gcs-path-style" as const) : ("origin" as const),
  transportBaseUrl:
    source === "sec-edgar"
      ? "https://data.sec.gov/"
      : source === "gdelt-gkg"
        ? "https://storage.googleapis.com/data.gdeltproject.org/gdeltv2/"
        : "https://www.stats.gov.cn/sj/zxfb/",
  tlsVerification: "required" as const,
  redirectPolicy: "error" as const,
  rawRetentionDays: 0,
});

const sourceRecord = (
  source: "sec-edgar" | "gdelt-gkg" | "nbs-cn-releases",
  index: number,
) => {
  const provenance = descriptor(source);
  const kind =
    source === "sec-edgar"
      ? ("filing" as const)
      : source === "gdelt-gkg"
        ? ("news" as const)
        : ("macro" as const);
  const sourceRecordId = `${source}-${index}`;
  return {
    sourceRecordId,
    kind,
    sourceUrl:
      source === "sec-edgar"
        ? `https://www.sec.gov/Archives/edgar/data/320193/${index}/index.html`
        : source === "gdelt-gkg"
          ? `https://publisher.example.com/news/${index}`
          : `https://www.stats.gov.cn/sj/zxfb/202608/t${index}.html`,
    publishedAt: `2026-08-12T0${index}:00:00.000Z`,
    fetchedAt: `2026-08-12T0${index}:05:00.000Z`,
    lastSeenAt: `2026-08-12T0${index}:05:00.000Z`,
    publisher: {
      name:
        source === "sec-edgar"
          ? "U.S. Securities and Exchange Commission"
          : source === "gdelt-gkg"
            ? "publisher.example.com"
            : "国家统计局",
    },
    content: {
      title:
        source === "sec-edgar"
          ? "Example issuer filed Form 8-K"
          : source === "gdelt-gkg"
            ? "Global market source title"
            : "国家统计局发布宏观数据",
      language: source === "gdelt-gkg" ? "en" : "zh-CN",
      symbols: source === "sec-edgar" ? ["AAPL"] : [],
      topics: [kind],
      attributes:
        source === "sec-edgar"
          ? {
              accessionNumber: "0000320193-26-000001",
              cik: "0000320193",
              formType: "8-K",
              reportingPeriod: "2026-06-30",
            }
          : {},
    },
    provenance,
    contentHash: `sha256:${String(index).repeat(64)}`,
  };
};

const snapshot = () => ({
  schemaVersion: 1 as const,
  generatedAt: "2026-08-12T03:00:00.000Z",
  sources: [
    {
      descriptor: descriptor("sec-edgar"),
      lastRunStatus: "ready" as const,
      lastAttemptAt: "2026-08-12T02:58:00.000Z",
      lastSuccessAt: "2026-08-12T02:58:00.000Z",
      staleAt: "2026-08-12T03:13:00.000Z",
    },
    {
      descriptor: descriptor("gdelt-gkg"),
      lastRunStatus: "degraded" as const,
      lastAttemptAt: "2026-08-12T02:50:00.000Z",
      lastSuccessAt: "2026-08-12T02:20:00.000Z",
      staleAt: "2026-08-12T02:50:00.000Z",
      failureCode: "SOURCE_UNAVAILABLE" as const,
    },
    {
      descriptor: descriptor("nbs-cn-releases"),
      lastRunStatus: "ready" as const,
      lastAttemptAt: "2026-08-12T02:30:00.000Z",
      lastSuccessAt: "2026-08-12T02:30:00.000Z",
      staleAt: "2026-08-12T04:30:00.000Z",
    },
  ],
  records: [
    sourceRecord("sec-edgar", 1),
    sourceRecord("gdelt-gkg", 2),
    sourceRecord("nbs-cn-releases", 3),
  ],
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("public finance snapshot server boundary", () => {
  it("maps the exact three source policies into honest dense view models", () => {
    const model = toFinancePublicViewModel(snapshot(), {
      now: "2026-08-12T03:00:00.000Z",
      selectedRecordId: null,
    });

    expect(model.state).toBe("degraded");
    expect(model.sources.map(({ id, status }) => [id, status])).toEqual([
      ["sec", "healthy"],
      ["gdelt", "degraded"],
      ["nbs", "healthy"],
    ]);
    expect(model.records.map(({ sourceId, kind }) => [sourceId, kind])).toEqual(
      [
        ["nbs", "macro-release"],
        ["gdelt", "news-link"],
        ["sec", "filing"],
      ],
    );
    expect(
      model.records.find(({ sourceId }) => sourceId === "sec"),
    ).toMatchObject({
      facts: expect.arrayContaining([
        { label: "表单", value: "8-K" },
        { label: "提交编号", value: "0000320193-26-000001" },
      ]),
    });
    expect(
      model.records.find(({ sourceId }) => sourceId === "gdelt"),
    ).not.toHaveProperty("facts");
    expect(JSON.stringify(model)).not.toContain("synthetic");
  });

  it("marks preserved records stale from source policy rather than a stored boolean", () => {
    const model = toFinancePublicViewModel(snapshot(), {
      now: "2026-08-12T05:00:00.000Z",
      selectedRecordId: null,
    });

    expect(model.state).toBe("degraded");
    expect(model.sources.every(({ status }) => status !== "healthy")).toBe(
      true,
    );
    expect(model.records.every(({ freshness }) => freshness === "stale")).toBe(
      true,
    );
  });

  it("fails closed for unknown source policy instead of guessing a presentation", () => {
    const candidate = snapshot();
    const unsafe = {
      ...candidate,
      sources: [
        {
          ...candidate.sources[0],
          descriptor: {
            ...candidate.sources[0]?.descriptor,
            source: "unreviewed-real-source",
          },
        },
      ],
      records: [],
    };

    expect(() =>
      toFinancePublicViewModel(unsafe, {
        now: "2026-08-12T03:00:00.000Z",
        selectedRecordId: null,
      }),
    ).toThrow(/unsupported public finance source/u);
  });

  it("keeps public detail identities stable when a source corrects record content", () => {
    const first = snapshot();
    const corrected = {
      ...first,
      records: first.records.map((record, index) =>
        index === 0
          ? {
              ...record,
              contentHash: `sha256:${"f".repeat(64)}`,
            }
          : record,
      ),
    };

    const firstModel = toFinancePublicViewModel(first, {
      now: "2026-08-12T03:00:00.000Z",
      selectedRecordId: null,
    });
    const correctedModel = toFinancePublicViewModel(corrected, {
      now: "2026-08-12T03:00:00.000Z",
      selectedRecordId: null,
    });

    expect(correctedModel.records.map(({ id }) => id)).toEqual(
      firstModel.records.map(({ id }) => id),
    );
  });

  it("returns missing without inventing fallback records", async () => {
    const directory = await mkdtemp(join(tmpdir(), "huoqiu-web-finance-"));
    temporaryDirectories.push(directory);

    await expect(
      loadFinancePublicViewModel({
        directory,
        now: "2026-08-12T03:00:00.000Z",
        selectedRecordId: null,
      }),
    ).resolves.toMatchObject({ state: "missing", records: [] });
  });

  it("falls back to an independently valid previous snapshot and discloses degradation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "huoqiu-web-finance-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "public-v1.json"), "{broken", "utf8");
    await writeFile(
      join(directory, "public-v1.previous.json"),
      `${JSON.stringify(snapshot())}\n`,
      "utf8",
    );

    const model = await loadFinancePublicViewModel({
      directory,
      now: "2026-08-12T03:00:00.000Z",
      selectedRecordId: null,
    });

    expect(model.state).toBe("degraded");
    expect(model.statusMessage).toMatch(/上一个已验证快照/u);
    expect(model.records).toHaveLength(3);
  });

  it("returns invalid when every available snapshot violates the contract", async () => {
    const directory = await mkdtemp(join(tmpdir(), "huoqiu-web-finance-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "public-v1.json"), "{broken", "utf8");
    await writeFile(
      join(directory, "public-v1.previous.json"),
      JSON.stringify({ title: "must never leak" }),
      "utf8",
    );

    const model = await loadFinancePublicViewModel({
      directory,
      now: "2026-08-12T03:00:00.000Z",
      selectedRecordId: null,
    });

    expect(model).toMatchObject({ state: "invalid", records: [] });
    expect(JSON.stringify(model)).not.toContain("must never leak");
  });

  it("does not follow a runtime symlink in place of the current snapshot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "huoqiu-web-finance-"));
    temporaryDirectories.push(directory);
    const target = join(directory, "attacker-controlled.json");
    await writeFile(target, `${JSON.stringify(snapshot())}\n`, "utf8");
    await symlink(target, join(directory, "public-v1.json"));

    await expect(
      loadFinancePublicViewModel({
        directory,
        now: "2026-08-12T03:00:00.000Z",
        selectedRecordId: null,
      }),
    ).resolves.toMatchObject({ state: "invalid", records: [] });
  });

  it("rejects an oversized runtime snapshot before parsing it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "huoqiu-web-finance-"));
    temporaryDirectories.push(directory);
    await writeFile(
      join(directory, "public-v1.json"),
      "x".repeat(2 * 1024 * 1024 + 1),
      "utf8",
    );

    await expect(
      loadFinancePublicViewModel({
        directory,
        now: "2026-08-12T03:00:00.000Z",
        selectedRecordId: null,
      }),
    ).resolves.toMatchObject({ state: "invalid", records: [] });
  });

  it("rejects relative runtime directories before touching the filesystem", async () => {
    await expect(
      loadFinancePublicViewModel({
        directory: ".runtime/finance",
        now: "2026-08-12T03:00:00.000Z",
        selectedRecordId: null,
      }),
    ).rejects.toThrow(/absolute/u);
  });

  it("loads only from an explicitly configured absolute runtime directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "huoqiu-web-finance-"));
    temporaryDirectories.push(directory);

    await expect(
      loadRuntimeFinancePublicViewModel({
        environment: { HUOQIU_FINANCE_SNAPSHOT_DIRECTORY: directory },
        now: "2026-08-12T03:00:00.000Z",
        selectedRecordId: null,
      }),
    ).resolves.toMatchObject({ state: "missing", records: [] });
  });

  it("fails closed for a relative runtime directory configuration", async () => {
    await expect(
      loadRuntimeFinancePublicViewModel({
        environment: {
          HUOQIU_FINANCE_SNAPSHOT_DIRECTORY: ".runtime/finance",
        },
        now: "2026-08-12T03:00:00.000Z",
        selectedRecordId: null,
      }),
    ).resolves.toMatchObject({ state: "invalid", records: [] });
  });
});
