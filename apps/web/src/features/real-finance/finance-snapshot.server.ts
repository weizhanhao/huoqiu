import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import {
  publicFinanceSnapshotSchema,
  type PublicFinanceSnapshot,
  type PublicFinanceSourceState,
} from "@huoqiu/contracts/finance/public-snapshot-v1";

import {
  type FinanceFactViewModel,
  type FinancePublicRecordViewModel,
  type FinancePublicState,
  type FinancePublicViewModel,
  type FinanceSourceId,
  type FinanceSourceStatus,
  type FinanceSourceViewModel,
  validateFinancePublicSourceUrl,
} from "./finance-public-view-model";

const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const CURRENT_FILENAME = "public-v1.json";
const PREVIOUS_FILENAME = "public-v1.previous.json";

const sourcePresentation = {
  "sec-edgar": {
    id: "sec",
    kind: "filing",
    label: "SEC EDGAR",
    description: "美国上市公司官方申报元数据",
  },
  "gdelt-gkg": {
    id: "gdelt",
    kind: "news",
    label: "GDELT",
    description: "全球新闻发现元数据与原文链接",
  },
  "nbs-cn-releases": {
    id: "nbs",
    kind: "macro",
    label: "国家统计局",
    description: "中国宏观数据官方发布元数据",
  },
} as const satisfies Readonly<
  Record<
    string,
    Readonly<{
      id: FinanceSourceId;
      kind: "filing" | "news" | "macro";
      label: string;
      description: string;
    }>
  >
>;

const sourceOrder: Readonly<Record<FinanceSourceId, number>> = {
  sec: 0,
  gdelt: 1,
  nbs: 2,
};

const publicRecordId = (source: string, sourceRecordId: string): string =>
  `finance_${createHash("sha256")
    .update(source)
    .update("\0")
    .update(sourceRecordId)
    .digest("hex")}`;

type FinanceSnapshotReadResult =
  | Readonly<{
      status: "ready";
      snapshot: PublicFinanceSnapshot;
      usedPrevious: boolean;
    }>
  | Readonly<{ status: "missing" | "invalid" }>;

type FinanceSnapshotViewOptions = Readonly<{
  now: string;
  selectedRecordId: string | null;
}>;

type FinanceSnapshotLoadOptions = FinanceSnapshotViewOptions &
  Readonly<{ directory: string }>;

type RuntimeFinanceSnapshotLoadOptions = Readonly<{
  selectedRecordId: string | null;
  now?: string;
  environment?: Readonly<Record<string, string | undefined>>;
  cwd?: string;
}>;

const RUNTIME_DIRECTORY_ENVIRONMENT_VARIABLE =
  "HUOQIU_FINANCE_SNAPSHOT_DIRECTORY";

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error &&
  "code" in error &&
  (error as Error & { code?: unknown }).code === "ENOENT";

const canonicalTimestamp = (value: string): string => {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new TypeError("Finance snapshot clock must be a valid timestamp");
  }
  return timestamp.toISOString();
};

const readBoundedSnapshot = async (
  path: string,
): Promise<PublicFinanceSnapshot | null> => {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }

  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.size > MAX_SNAPSHOT_BYTES) {
      throw new TypeError("Finance public snapshot file is not a bounded file");
    }
    const contents = await file.readFile({ encoding: "utf8" });
    if (Buffer.byteLength(contents, "utf8") > MAX_SNAPSHOT_BYTES) {
      throw new TypeError("Finance public snapshot exceeds its byte limit");
    }
    return publicFinanceSnapshotSchema.parse(JSON.parse(contents));
  } finally {
    await file.close();
  }
};

const readLatestSnapshot = async (
  directory: string,
): Promise<FinanceSnapshotReadResult> => {
  let currentMissing = false;
  try {
    const current = await readBoundedSnapshot(
      join(directory, CURRENT_FILENAME),
    );
    if (current !== null) {
      return { status: "ready", snapshot: current, usedPrevious: false };
    }
    currentMissing = true;
  } catch {
    // Current is never surfaced unless it independently passes the contract.
  }

  try {
    const previous = await readBoundedSnapshot(
      join(directory, PREVIOUS_FILENAME),
    );
    if (previous !== null) {
      return { status: "ready", snapshot: previous, usedPrevious: true };
    }
    return { status: currentMissing ? "missing" : "invalid" };
  } catch {
    return { status: "invalid" };
  }
};

const cadenceLabel = (seconds: number): string => {
  if (seconds === 0) return "事件驱动";
  if (seconds % 3_600 === 0) return `每 ${seconds / 3_600} 小时`;
  if (seconds % 60 === 0) return `每 ${seconds / 60} 分钟`;
  return `每 ${seconds} 秒`;
};

const presentationFor = (source: string) => {
  if (!(source in sourcePresentation)) {
    throw new TypeError(`unsupported public finance source: ${source}`);
  }
  return sourcePresentation[source as keyof typeof sourcePresentation];
};

const sourceIsStale = (
  source: PublicFinanceSourceState,
  now: string,
): boolean =>
  source.staleAt !== null && Date.parse(now) >= Date.parse(source.staleAt);

const sourceStatus = (
  source: PublicFinanceSourceState,
  now: string,
): FinanceSourceStatus => {
  if (source.lastRunStatus === "degraded") return "degraded";
  if (sourceIsStale(source, now)) return "stale";
  if (source.lastRunStatus === "empty") return "unavailable";
  return "healthy";
};

const factsFromAttributes = (
  sourceId: FinanceSourceId,
  attributes: PublicFinanceSnapshot["records"][number]["content"]["attributes"],
): readonly FinanceFactViewModel[] => {
  const facts: FinanceFactViewModel[] = [];
  const add = (label: string, value: string | number | undefined) => {
    if (value !== undefined) facts.push({ label, value: String(value) });
  };

  if (sourceId === "sec") {
    add("表单", attributes.formType ?? attributes.filingType);
    add("提交编号", attributes.accessionNumber);
    add("CIK", attributes.cik);
    add("报告期", attributes.reportingPeriod ?? attributes.period);
  } else if (sourceId === "nbs") {
    add("指标值", attributes.value);
    add("单位", attributes.unit);
    add("统计期", attributes.period);
    add("发布类型", attributes.eventType ?? attributes.documentType);
    if (facts.length === 0) {
      facts.push({ label: "发布类型", value: "国家统计局官方发布" });
    }
  }

  return facts;
};

const toRecordViewModel = (
  record: PublicFinanceSnapshot["records"][number],
  state: PublicFinanceSourceState,
  now: string,
): FinancePublicRecordViewModel => {
  const presentation = presentationFor(record.provenance.source);
  if (record.kind !== presentation.kind) {
    throw new TypeError(
      `unsupported ${record.provenance.source} record kind: ${record.kind}`,
    );
  }
  const sourceUrl = validateFinancePublicSourceUrl(record.sourceUrl);
  if (sourceUrl === null) {
    throw new TypeError("Finance record source URL is not display-safe");
  }
  const common = {
    id: publicRecordId(record.provenance.source, record.sourceRecordId),
    title: record.content.title,
    publisher: record.publisher.name,
    publishedAt: record.publishedAt,
    fetchedAt: record.fetchedAt,
    freshness: sourceIsStale(state, now)
      ? ("stale" as const)
      : ("fresh" as const),
    sourceUrl,
    attribution: record.provenance.attribution,
    language: record.content.language,
    topics: record.content.topics,
    symbols: record.content.symbols,
  };

  if (presentation.id === "gdelt") {
    return { ...common, sourceId: "gdelt", kind: "news-link" };
  }
  if (presentation.id === "sec") {
    return {
      ...common,
      sourceId: "sec",
      kind: "filing",
      facts: factsFromAttributes("sec", record.content.attributes),
    };
  }
  return {
    ...common,
    sourceId: "nbs",
    kind: "macro-release",
    facts: factsFromAttributes("nbs", record.content.attributes),
  };
};

const globalState = (
  sources: readonly FinanceSourceViewModel[],
  records: readonly FinancePublicRecordViewModel[],
): FinancePublicState => {
  if (sources.some(({ status }) => status === "degraded")) return "degraded";
  if (records.length === 0) return "empty";
  if (sources.some(({ status }) => status === "stale")) return "stale";
  return "ready";
};

const statusMessageFor = (state: FinancePublicState): string | undefined => {
  if (state === "degraded") {
    return "一个或多个真实来源抓取异常；仅保留上次成功获取并通过校验的真实记录。";
  }
  if (state === "stale") {
    return "一个或多个真实来源超过其许可策略规定的新鲜度窗口，记录可能过期。";
  }
  if (state === "empty") {
    return "本轮没有返回符合公开展示许可的真实记录。";
  }
  return undefined;
};

const terminalModel = (
  state: "missing" | "invalid",
  selectedRecordId: string | null,
): FinancePublicViewModel => ({
  state,
  generatedAt: null,
  selectedRecordId,
  statusMessage:
    state === "missing"
      ? "稍后再来看看。"
      : "当前与上一份真实财经快照均未通过完整性校验。",
  sources: [],
  records: [],
});

export const toFinancePublicViewModel = (
  input: unknown,
  options: FinanceSnapshotViewOptions,
): FinancePublicViewModel => {
  const snapshot = publicFinanceSnapshotSchema.parse(input);
  const now = canonicalTimestamp(options.now);
  const sourceStates = new Map(
    snapshot.sources.map((state) => [state.descriptor.source, state]),
  );
  const sources = snapshot.sources
    .map((state): FinanceSourceViewModel => {
      const presentation = presentationFor(state.descriptor.source);
      return {
        id: presentation.id,
        label: presentation.label,
        description: presentation.description,
        status: sourceStatus(state, now),
        updatedAt: state.lastSuccessAt ?? state.lastAttemptAt,
        recordCount: snapshot.records.filter(
          (record) => record.provenance.source === state.descriptor.source,
        ).length,
        cadenceLabel: cadenceLabel(state.descriptor.nativeCadenceSeconds),
      };
    })
    .sort((left, right) => sourceOrder[left.id] - sourceOrder[right.id]);

  const records = snapshot.records
    .map((record) => {
      const state = sourceStates.get(record.provenance.source);
      if (state === undefined) {
        throw new TypeError(
          "Finance record references an unknown source state",
        );
      }
      return toRecordViewModel(record, state, now);
    })
    .sort(
      (left, right) =>
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt) ||
        left.id.localeCompare(right.id),
    );
  const state = globalState(sources, records);
  const statusMessage = statusMessageFor(state);

  return {
    state,
    generatedAt: snapshot.generatedAt,
    selectedRecordId: options.selectedRecordId,
    ...(statusMessage === undefined ? {} : { statusMessage }),
    sources,
    records,
  };
};

export const loadFinancePublicViewModel = async (
  options: FinanceSnapshotLoadOptions,
): Promise<FinancePublicViewModel> => {
  if (!isAbsolute(options.directory)) {
    throw new TypeError("Finance snapshot runtime directory must be absolute");
  }

  const result = await readLatestSnapshot(options.directory);
  if (result.status !== "ready") {
    return terminalModel(result.status, options.selectedRecordId);
  }

  try {
    const model = toFinancePublicViewModel(result.snapshot, options);
    if (!result.usedPrevious) return model;
    return {
      ...model,
      state: "degraded",
      statusMessage:
        "当前快照未通过校验，正在展示上一个已验证快照中的真实记录。",
    };
  } catch {
    return terminalModel("invalid", options.selectedRecordId);
  }
};

export const loadRuntimeFinancePublicViewModel = async (
  options: RuntimeFinanceSnapshotLoadOptions,
): Promise<FinancePublicViewModel> => {
  const environment = options.environment ?? process.env;
  const configuredDirectory =
    environment[RUNTIME_DIRECTORY_ENVIRONMENT_VARIABLE];
  const directory =
    configuredDirectory === undefined
      ? resolve(options.cwd ?? process.cwd(), ".runtime/finance")
      : configuredDirectory.trim();

  if (directory.length === 0 || !isAbsolute(directory)) {
    return terminalModel("invalid", options.selectedRecordId);
  }

  return loadFinancePublicViewModel({
    directory,
    now: options.now ?? new Date().toISOString(),
    selectedRecordId: options.selectedRecordId,
  });
};
