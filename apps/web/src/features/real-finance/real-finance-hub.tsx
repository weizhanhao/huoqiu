"use client";

import { useMemo, useState } from "react";

import type {
  FinancePublicRecordViewModel,
  FinancePublicViewModel,
  FinanceSourceId,
} from "./finance-public-view-model";
import styles from "./real-finance.module.css";
import {
  canDisplayFinanceRecords,
  FinanceRecordSummary,
  FinanceStateNotice,
  financeSourceLabels,
  financeSourceOrder,
  formatCstDateTime,
  SourceHealthGrid,
} from "./real-finance-shared";

const initialSourceLimits = {
  sec: 8,
  gdelt: 12,
  nbs: 6,
} as const;

type SourceFilter = "all" | FinanceSourceId;
type KindFilter = "all" | FinancePublicRecordViewModel["kind"];

const sourceFilters = [
  { id: "all", label: "全部来源" },
  { id: "sec", label: "SEC EDGAR" },
  { id: "gdelt", label: "GDELT" },
  { id: "nbs", label: "国家统计局" },
] satisfies readonly { id: SourceFilter; label: string }[];

const searchableRecordText = (record: FinancePublicRecordViewModel) =>
  [
    record.title,
    record.publisher,
    record.attribution,
    ...record.symbols,
    ...record.topics,
  ]
    .join(" ")
    .toLocaleLowerCase("zh-CN");

type RealFinanceHubProperties = Readonly<{
  model: FinancePublicViewModel;
}>;

export function RealFinanceHub({ model }: RealFinanceHubProperties) {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [expandedSources, setExpandedSources] = useState<
    ReadonlySet<FinanceSourceId>
  >(() => new Set());
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const filteredRecords = useMemo(
    () =>
      model.records.filter(
        (record) =>
          (sourceFilter === "all" || record.sourceId === sourceFilter) &&
          (kindFilter === "all" || record.kind === kindFilter) &&
          (normalizedQuery.length === 0 ||
            searchableRecordText(record).includes(normalizedQuery)),
      ),
    [kindFilter, model.records, normalizedQuery, sourceFilter],
  );

  const toggleSourceExpansion = (sourceId: FinanceSourceId) => {
    setExpandedSources((current) => {
      const next = new Set(current);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  };

  return (
    <main
      className={styles.surface}
      data-testid="real-finance-hub"
      lang="zh-CN"
    >
      <header className={styles.hero}>
        <p>真实来源 · 可追溯 · 不使用合成财经信息补位</p>
        <h1>财经资讯</h1>
        {model.generatedAt !== null && (
          <p>
            公共快照生成于
            <time dateTime={model.generatedAt}>
              {formatCstDateTime(model.generatedAt)}
            </time>
          </p>
        )}
      </header>

      <section
        aria-labelledby="real-finance-sources-heading"
        className={styles.sectionPanel}
      >
        <div className={styles.sectionHeading}>
          <h2 id="real-finance-sources-heading">来源运行状态</h2>
          <p>状态与记录数量均来自注入的公共快照</p>
        </div>
        <SourceHealthGrid sources={model.sources} />
      </section>

      <FinanceStateNotice message={model.statusMessage} state={model.state} />

      {canDisplayFinanceRecords(model.state) && (
        <section
          aria-labelledby="real-finance-filters-heading"
          className={styles.filterPanel}
        >
          <h2 id="real-finance-filters-heading">筛选真实记录</h2>
          <div className={styles.filterGrid}>
            <fieldset className={styles.sourceFilters}>
              <legend>来源</legend>
              <div>
                {sourceFilters.map((source) => (
                  <button
                    aria-label={
                      source.id === "all"
                        ? "查看全部来源"
                        : `只看 ${source.label}`
                    }
                    aria-pressed={sourceFilter === source.id}
                    key={source.id}
                    onClick={() => setSourceFilter(source.id)}
                    type="button"
                  >
                    {source.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className={styles.filterField}>
              <span>记录类型</span>
              <select
                onChange={(event) =>
                  setKindFilter(event.currentTarget.value as KindFilter)
                }
                value={kindFilter}
              >
                <option value="all">全部类型</option>
                <option value="filing">监管申报</option>
                <option value="news-link">新闻线索</option>
                <option value="macro-release">宏观发布</option>
              </select>
            </label>

            <label className={styles.filterField}>
              <span>关键词</span>
              <input
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="标题、发布者、标记"
                type="search"
                value={query}
              />
            </label>
          </div>
          <p aria-live="polite" className={styles.filterResult} role="status">
            已筛选 {filteredRecords.length} 条真实记录
          </p>
        </section>
      )}

      {canDisplayFinanceRecords(model.state) &&
        filteredRecords.length === 0 && (
          <section
            aria-live="polite"
            className={styles.stateNotice}
            role="status"
          >
            <h2>没有符合条件的真实记录</h2>
            <p>请调整来源、类型或关键词。不会使用合成财经信息补位。</p>
          </section>
        )}

      {canDisplayFinanceRecords(model.state) &&
        financeSourceOrder.map((sourceId) => {
          const sourceRecords = filteredRecords.filter(
            (record) => record.sourceId === sourceId,
          );
          const expanded = expandedSources.has(sourceId);
          const records = expanded
            ? sourceRecords
            : sourceRecords.slice(0, initialSourceLimits[sourceId]);

          if (records.length === 0) return null;

          return (
            <section
              aria-labelledby={`real-finance-${sourceId}-heading`}
              className={`${styles.sectionPanel} ${styles.recordSection}`}
              data-source-section={sourceId}
              key={sourceId}
            >
              <div className={styles.recordSectionHeading}>
                <h2 id={`real-finance-${sourceId}-heading`}>
                  {financeSourceLabels[sourceId]}
                </h2>
                <p>
                  首屏 {records.length} 条 · 共{sourceRecords.length}条
                </p>
              </div>
              {sourceId === "gdelt" && (
                <p className={styles.metadataNotice}>
                  仅展示标题、来源、时间和原始链接；不缓存正文、摘要或图片。
                </p>
              )}
              <div className={styles.recordGrid}>
                {records.map((record) => (
                  <FinanceRecordSummary key={record.id} record={record} />
                ))}
              </div>
              {sourceRecords.length > initialSourceLimits[sourceId] && (
                <button
                  aria-expanded={expanded}
                  aria-label={
                    expanded
                      ? `收起 ${financeSourceLabels[sourceId]}`
                      : `展开 ${financeSourceLabels[sourceId]} 全部 ${sourceRecords.length} 条`
                  }
                  className={styles.expandButton}
                  onClick={() => toggleSourceExpansion(sourceId)}
                  type="button"
                >
                  {expanded ? "收起" : `展开全部 ${sourceRecords.length} 条`}
                </button>
              )}
            </section>
          );
        })}
    </main>
  );
}
