export type FinanceSourceId = "sec" | "gdelt" | "nbs";

export type FinancePublicState =
  "ready" | "empty" | "degraded" | "stale" | "missing" | "invalid";

export type FinanceSourceStatus =
  "healthy" | "degraded" | "stale" | "unavailable";

export type FinanceFreshness = "fresh" | "stale";

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
  sourceUrl: string;
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
