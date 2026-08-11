export type FinanceSourceId = "sec" | "gdelt" | "nbs";

export type FinancePublicState =
  "ready" | "empty" | "degraded" | "stale" | "missing" | "invalid";

export type FinanceSourceStatus =
  "healthy" | "degraded" | "stale" | "unavailable";

export type FinanceFreshness = "fresh" | "stale";

declare const financePublicSourceUrlBrand: unique symbol;

export type FinancePublicSourceUrl = string &
  Readonly<{ [financePublicSourceUrlBrand]: true }>;

const ipv4Hostname = /^(?:\d{1,3}\.){3}\d{1,3}$/u;
const hasForbiddenUrlCharacter = (value: string) =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x20 || codePoint === 0x7f || character === "\\";
  });

export const validateFinancePublicSourceUrl = (
  value: unknown,
): FinancePublicSourceUrl | null => {
  if (
    typeof value !== "string" ||
    !value.startsWith("https://") ||
    value !== value.trim() ||
    hasForbiddenUrlCharacter(value)
  ) {
    return null;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const unsafeHostname =
      hostname.length === 0 ||
      hostname.length > 253 ||
      !hostname.includes(".") ||
      hostname.startsWith(".") ||
      hostname.endsWith(".") ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.startsWith("[") ||
      hostname.includes(":") ||
      ipv4Hostname.test(hostname);

    if (
      url.protocol !== "https:" ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.hash.length > 0 ||
      (url.port.length > 0 && url.port !== "443") ||
      unsafeHostname
    ) {
      return null;
    }

    return value as FinancePublicSourceUrl;
  } catch {
    return null;
  }
};

export type FinanceFactViewModel = Readonly<{
  label: string;
  value: string;
}>;

type FinanceRecordBase = Readonly<{
  id: string;
  title: string;
  publisher: string;
  publishedAt: string;
  fetchedAt: string;
  freshness: FinanceFreshness;
  sourceUrl: FinancePublicSourceUrl;
  attribution: string;
  language: string;
  topics: readonly string[];
  symbols: readonly string[];
}>;

export type FinancePublicRecordViewModel =
  | (FinanceRecordBase &
      Readonly<{
        sourceId: "sec";
        kind: "filing";
        facts: readonly FinanceFactViewModel[];
      }>)
  | (FinanceRecordBase &
      Readonly<{
        sourceId: "gdelt";
        kind: "news-link";
        facts?: never;
      }>)
  | (FinanceRecordBase &
      Readonly<{
        sourceId: "nbs";
        kind: "macro-release";
        facts: readonly FinanceFactViewModel[];
      }>);

export type FinanceSourceViewModel = Readonly<{
  id: FinanceSourceId;
  label: string;
  description: string;
  status: FinanceSourceStatus;
  updatedAt: string;
  recordCount: number;
  cadenceLabel: string;
}>;

export type FinancePublicViewModel = Readonly<{
  state: FinancePublicState;
  generatedAt: string | null;
  selectedRecordId: string | null;
  statusMessage?: string;
  sources: readonly FinanceSourceViewModel[];
  records: readonly FinancePublicRecordViewModel[];
}>;
