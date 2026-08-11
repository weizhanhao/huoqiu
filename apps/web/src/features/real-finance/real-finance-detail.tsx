import type { FinancePublicViewModel } from "./finance-public-view-model";
import styles from "./real-finance.module.css";
import {
  canDisplayFinanceRecords,
  FinanceExternalSourceLink,
  financeKindLabels,
  financeSourceLabels,
  FinanceStateNotice,
  formatCstDateTime,
} from "./real-finance-shared";

type RealFinanceDetailProperties = Readonly<{
  model: FinancePublicViewModel;
}>;

export function RealFinanceDetail({ model }: RealFinanceDetailProperties) {
  const record = model.records.find(({ id }) => id === model.selectedRecordId);
  const canDisplay = canDisplayFinanceRecords(model.state);

  return (
    <main
      className={styles.surface}
      data-testid="real-finance-detail"
      lang="zh-CN"
    >
      <header className={styles.hero}>
        <p>真实来源记录 · 事实与元数据</p>
        <h1
          lang={
            canDisplay && record !== undefined ? record.language : undefined
          }
        >
          {canDisplay && record !== undefined ? record.title : "财经记录详情"}
        </h1>
        <p>此页面不复制第三方正文、新闻摘要或媒体素材</p>
      </header>

      <FinanceStateNotice message={model.statusMessage} state={model.state} />

      {canDisplay && record === undefined && (
        <section
          aria-live="polite"
          className={styles.stateNotice}
          role="status"
        >
          <h2>未找到这条真实财经记录</h2>
          <p>记录可能已从当前公共快照移除。</p>
          <p>不会使用合成财经信息补位。</p>
        </section>
      )}

      {canDisplay && record !== undefined && (
        <article className={styles.detailPanel}>
          <header className={styles.detailHeader}>
            <div className={styles.recordHeader}>
              <span className={styles.kindPill}>
                {financeKindLabels[record.kind]}
              </span>
              <span
                className={
                  record.freshness === "fresh"
                    ? styles.freshPill
                    : styles.stalePill
                }
              >
                {record.freshness === "fresh" ? "新鲜" : "已陈旧"}
              </span>
            </div>
            <p>
              {record.sourceId === "gdelt" && "原发布域 · "}
              {record.publisher}
            </p>
          </header>

          <section aria-labelledby="real-finance-detail-metadata">
            <h2 id="real-finance-detail-metadata">来源元数据</h2>
            <dl className={styles.metadataGrid}>
              <div>
                <dt>来源</dt>
                <dd>{financeSourceLabels[record.sourceId]}</dd>
              </div>
              <div>
                <dt>{record.sourceId === "gdelt" ? "原发布域" : "发布机构"}</dt>
                <dd>{record.publisher}</dd>
              </div>
              <div>
                <dt>发布时间</dt>
                <dd>
                  <time dateTime={record.publishedAt}>
                    {formatCstDateTime(record.publishedAt)}
                  </time>
                </dd>
              </div>
              <div>
                <dt>采集时间</dt>
                <dd>
                  <time dateTime={record.fetchedAt}>
                    {formatCstDateTime(record.fetchedAt)}
                  </time>
                </dd>
              </div>
              <div>
                <dt>语言</dt>
                <dd>{record.language}</dd>
              </div>
              <div>
                <dt>新鲜度</dt>
                <dd>{record.freshness === "fresh" ? "新鲜" : "已陈旧"}</dd>
              </div>
            </dl>
          </section>

          {record.sourceId === "gdelt" ? (
            <section
              aria-labelledby="real-finance-detail-gdelt-policy"
              className={styles.metadataNotice}
            >
              <h2 id="real-finance-detail-gdelt-policy">
                GDELT 只提供发现元数据
              </h2>
              <p>
                火球仅展示标题、发布者、时间与原始链接，不缓存第三方正文、摘要或图片。
              </p>
            </section>
          ) : (
            <section aria-labelledby="real-finance-detail-facts">
              <h2 id="real-finance-detail-facts">结构化事实</h2>
              <dl className={styles.factGrid}>
                {record.facts.map((fact) => (
                  <div key={`${fact.label}:${fact.value}`}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {(record.symbols.length > 0 || record.topics.length > 0) && (
            <section aria-labelledby="real-finance-detail-tags">
              <h2 id="real-finance-detail-tags">关联标记</h2>
              <ul className={styles.tagList}>
                {[...record.symbols, ...record.topics].map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            </section>
          )}

          <footer className={styles.detailFooter}>
            <p>
              {record.sourceId === "gdelt" && "元数据来自 GDELT · "}
              {record.attribution}
            </p>
            <FinanceExternalSourceLink
              className={styles.outboundLink}
              record={record}
              unavailableChildren="原始来源链接不可用"
            >
              打开外部原始来源
            </FinanceExternalSourceLink>
          </footer>
        </article>
      )}
    </main>
  );
}
