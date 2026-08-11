import type {
  FinancePublicRecordViewModel,
  FinancePublicState,
  FinanceSourceId,
  FinanceSourceStatus,
  FinanceSourceViewModel,
} from "./finance-public-view-model";
import styles from "./real-finance.module.css";

export const financeSourceOrder = ["sec", "gdelt", "nbs"] as const;

export const financeSourceLabels = {
  sec: "SEC EDGAR",
  gdelt: "GDELT",
  nbs: "国家统计局",
} satisfies Record<FinanceSourceId, string>;

export const financeKindLabels = {
  filing: "监管申报",
  "news-link": "新闻线索",
  "macro-release": "宏观发布",
} as const;

const publicStateLabels = {
  ready: null,
  missing: "真实财经快照尚未生成",
  invalid: "真实财经快照校验失败",
  empty: "当前真实来源暂无可公开记录",
  degraded: "部分真实来源暂时不可用",
  stale: "展示上次成功更新的真实数据",
} satisfies Record<FinancePublicState, string | null>;

export const canDisplayFinanceRecords = (state: FinancePublicState) =>
  state === "ready" || state === "degraded" || state === "stale";

const sourceStatusLabels = {
  healthy: "运行正常",
  degraded: "部分降级",
  stale: "数据陈旧",
  unavailable: "暂不可用",
} satisfies Record<FinanceSourceStatus, string>;

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Shanghai",
  year: "numeric",
});

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Shanghai",
  year: "numeric",
});

const dateParts = (formatter: Intl.DateTimeFormat, date: Date) =>
  Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );

export const formatCstDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";

  const parts = dateParts(dateTimeFormatter, date);

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} CST`;
};

export const formatCstDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日期未知";

  const parts = dateParts(dateFormatter, date);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export function FinanceStateNotice({
  message,
  state,
}: Readonly<{ message: string | undefined; state: FinancePublicState }>) {
  const heading = publicStateLabels[state];
  if (heading === null) return null;

  return (
    <section
      aria-live="polite"
      className={`${styles.stateNotice} ${styles[`state-${state}`]}`}
      role={state === "invalid" ? "alert" : "status"}
    >
      <h2>{heading}</h2>
      {message !== undefined && <p>{message}</p>}
      <p>不会使用合成财经信息补位。</p>
    </section>
  );
}

export function SourceHealthGrid({
  sources,
}: Readonly<{ sources: readonly FinanceSourceViewModel[] }>) {
  return (
    <div className={styles.sourceGrid}>
      {sources.map((source) => (
        <article
          className={styles.sourceCard}
          data-source={source.id}
          key={source.id}
        >
          <p
            className={`${styles.statusPill} ${styles[`status-${source.status}`]}`}
          >
            {sourceStatusLabels[source.status]}
          </p>
          <h3>{source.label}</h3>
          <p className={styles.muted}>{source.description}</p>
          <dl className={styles.sourceMetrics}>
            <div>
              <dt>公开记录</dt>
              <dd>{source.recordCount}</dd>
            </div>
            <div>
              <dt>更新节奏</dt>
              <dd>{source.cadenceLabel}</dd>
            </div>
          </dl>
          <p className={styles.sourceUpdated}>
            最近同步
            <time dateTime={source.updatedAt}>
              {formatCstDateTime(source.updatedAt)}
            </time>
          </p>
        </article>
      ))}
    </div>
  );
}

export function FinanceRecordSummary({
  record,
}: Readonly<{ record: FinancePublicRecordViewModel }>) {
  return (
    <article className={styles.recordCard} data-record-source={record.sourceId}>
      <header className={styles.recordHeader}>
        <span className={styles.kindPill}>
          {financeKindLabels[record.kind]}
        </span>
        <span
          className={
            record.freshness === "fresh" ? styles.freshPill : styles.stalePill
          }
        >
          {record.freshness === "fresh" ? "新鲜" : "已陈旧"}
        </span>
      </header>
      <p className={styles.publisher}>
        {record.sourceId === "gdelt" && "原发布域 · "}
        {record.publisher}
      </p>
      <h3>
        <a
          aria-label={`打开外部原始来源：${record.publisher}，${record.title}`}
          className={styles.recordLink}
          href={record.sourceUrl}
          lang={record.language}
          rel="noopener noreferrer nofollow"
          target="_blank"
        >
          {record.title}
          <span aria-hidden="true"> ↗</span>
        </a>
      </h3>
      <dl className={styles.recordTimes}>
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
      </dl>
      {(record.symbols.length > 0 || record.topics.length > 0) && (
        <ul className={styles.tagList} aria-label="关联标签">
          {[...record.symbols, ...record.topics].map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      )}
      <footer className={styles.attribution}>
        {record.sourceId === "gdelt" && "元数据来自 GDELT · "}
        {record.attribution}
      </footer>
    </article>
  );
}
