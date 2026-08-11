import type {
  FinancePublicRecordViewModel,
  FinancePublicViewModel,
  FinanceSourceId,
} from "../../src/features/real-finance";

const publishedAt = (offsetMinutes: number) =>
  new Date(
    Date.parse("2026-08-12T01:30:00.000Z") - offsetMinutes * 60_000,
  ).toISOString();

const commonRecord = (sourceId: FinanceSourceId, index: number) => ({
  id: `${sourceId}-record-${String(index + 1).padStart(2, "0")}`,
  publishedAt: publishedAt(index * 180 + (sourceId === "sec" ? 0 : 5)),
  fetchedAt: publishedAt(index * 180),
  freshness: index === 7 ? ("stale" as const) : ("fresh" as const),
  language: sourceId === "gdelt" ? "en" : "zh-CN",
  topics: sourceId === "sec" ? ["公司申报"] : ["宏观观察"],
  symbols: sourceId === "sec" ? [`TEST${index + 1}`] : [],
});

const secRecords = Array.from({ length: 10 }, (_, index) => ({
  ...commonRecord("sec", index),
  sourceId: "sec" as const,
  kind: "filing" as const,
  title: `测试公司 ${index + 1} 向 SEC 提交 Form 8-K`,
  publisher: "U.S. Securities and Exchange Commission",
  sourceUrl: `https://www.sec.gov/Archives/edgar/data/1000${index}/filing-index.html`,
  attribution: "Source: SEC EDGAR",
  facts: [
    { label: "表单", value: "8-K" },
    { label: "提交编号", value: `000-test-${index + 1}` },
  ],
}));

const gdeltRecords = Array.from({ length: 14 }, (_, index) => ({
  ...commonRecord("gdelt", index),
  sourceId: "gdelt" as const,
  kind: "news-link" as const,
  title: `Global market source link ${index + 1}`,
  publisher: `Publisher ${index + 1}`,
  sourceUrl: `https://publisher.example/news/${index + 1}`,
  attribution: "Discovered via GDELT; rights remain with the publisher",
}));

const nbsRecords = Array.from({ length: 8 }, (_, index) => ({
  ...commonRecord("nbs", index),
  sourceId: "nbs" as const,
  kind: "macro-release" as const,
  title: `国家统计局发布测试宏观指标 ${index + 1}`,
  publisher: "国家统计局",
  sourceUrl: `https://www.stats.gov.cn/sj/zxfb/202608/t${index + 1}.html`,
  attribution: "来源：国家统计局官方网站",
  facts: [{ label: "发布类型", value: "官方数据发布" }],
}));

const records = [
  ...secRecords,
  ...gdeltRecords,
  ...nbsRecords,
] satisfies readonly FinancePublicRecordViewModel[];

export const denseFinanceModel = {
  state: "ready",
  generatedAt: "2026-08-12T01:30:00.000Z",
  selectedRecordId: "sec-record-01",
  sources: [
    {
      id: "sec",
      label: "SEC EDGAR",
      description: "美国上市公司官方申报元数据",
      status: "healthy",
      updatedAt: "2026-08-12T01:28:00.000Z",
      recordCount: secRecords.length,
      cadenceLabel: "每 5 分钟",
    },
    {
      id: "gdelt",
      label: "GDELT",
      description: "全球新闻发现元数据与原文链接",
      status: "degraded",
      updatedAt: "2026-08-12T01:20:00.000Z",
      recordCount: gdeltRecords.length,
      cadenceLabel: "每 15 分钟",
    },
    {
      id: "nbs",
      label: "国家统计局",
      description: "中国宏观数据官方发布元数据",
      status: "stale",
      updatedAt: "2026-08-12T00:30:00.000Z",
      recordCount: nbsRecords.length,
      cadenceLabel: "每 1 小时",
    },
  ],
  records,
} satisfies FinancePublicViewModel;
