"use client";

import Link from "next/link";
import { type KeyboardEvent, useState } from "react";

import { UnavailableAction } from "../../components/shell/unavailable-action";
import { WatchlistToggle } from "../../components/watchlist/watchlist-toggle";

import styles from "./instrument-detail.module.css";
import { InstrumentDetailChart } from "./instrument-detail-chart";
import {
  instrumentChartSeries,
  instrumentDetailTabs,
  instrumentMarketSnapshots,
  instrumentPeriodOptions,
  syntheticAnnouncements,
  syntheticConstituents,
  syntheticDiscussionPosts,
  syntheticInstrumentNews,
  syntheticRelatedEtfGroups,
  type InstrumentDetailTabId,
  type InstrumentPeriodId,
} from "./instrument-detail-data";
import type { SyntheticListing } from "./synthetic-data";

type SyntheticInstrumentDetailProperties = Readonly<{
  listing: SyntheticListing;
}>;

const signedPercent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

function TrendValue({ value }: Readonly<{ value: number }>) {
  return (
    <span className={value >= 0 ? styles.up : styles.down}>
      {signedPercent(value)}
    </span>
  );
}

export function SyntheticInstrumentDetail({
  listing,
}: SyntheticInstrumentDetailProperties) {
  const [activePeriod, setActivePeriod] =
    useState<InstrumentPeriodId>("intraday");
  const [activeTab, setActiveTab] =
    useState<InstrumentDetailTabId>("discussion");
  const [discussionSort, setDiscussionSort] = useState<"latest" | "hot">(
    "latest",
  );
  const [followedAuthors, setFollowedAuthors] = useState<readonly string[]>([]);
  const [likedPosts, setLikedPosts] = useState<readonly string[]>([]);
  const [notice, setNotice] = useState("");
  const isUp = listing.changePct >= 0;
  const price = Number(listing.price);
  const previousClose = price / (1 + listing.changePct / 100);
  const changeAmount = price - previousClose;
  const open = previousClose * (isUp ? 1.008 : 0.996);
  const high = Math.max(price, open, previousClose) * 1.01;
  const low = Math.min(price, open, previousClose) * 0.994;
  const marketSnapshot = instrumentMarketSnapshots[listing.market];
  const chartSeries =
    instrumentChartSeries.find((series) => series.id === activePeriod) ??
    instrumentChartSeries[0];
  const visiblePosts =
    discussionSort === "latest"
      ? syntheticDiscussionPosts
      : [...syntheticDiscussionPosts].sort(
          (left, right) => right.likes - left.likes,
        );

  const toggleValue = (
    values: readonly string[],
    value: string,
  ): readonly string[] =>
    values.includes(value)
      ? values.filter((candidate) => candidate !== value)
      : [...values, value];

  const handleDetailTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = instrumentDetailTabs.findIndex(
      (tab) => tab.id === activeTab,
    );
    let nextIndex: number | undefined;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % instrumentDetailTabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + instrumentDetailTabs.length) %
        instrumentDetailTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = instrumentDetailTabs.length - 1;
    }

    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextTab = instrumentDetailTabs[nextIndex];
    if (nextTab === undefined) return;
    setActiveTab(nextTab.id);
    document.getElementById(`instrument-tab-${nextTab.id}`)?.focus();
  };

  return (
    <article
      className={styles.instrumentDetail}
      data-testid="synthetic-instrument-detail"
    >
      <nav aria-label="标的详情快捷操作" className={styles.quickActions}>
        <Link href="/markets">← 返回行情</Link>
        <span className={styles.quickActionSpacer} />
        <Link href="/search">搜索</Link>
        <UnavailableAction label="更多" />
      </nav>

      <header className={styles.quotePanel}>
        <div className={styles.identity}>
          <p className={styles.kicker}>
            {listing.marketLabel} · {listing.symbol} · SYNTHETIC
          </p>
          <h2>{listing.name}</h2>
          <p>{listing.currency} · 交易时段演示 · 2026-08-07 14:20</p>
        </div>
        <div className={styles.quoteValue}>
          <strong>{listing.price}</strong>
          <span className={isUp ? styles.up : styles.down}>
            {changeAmount >= 0 ? "+" : ""}
            {changeAmount.toFixed(2)} · {signedPercent(listing.changePct)}
          </span>
          <small>{isUp ? "上涨" : "下跌"} · 固定合成数据</small>
        </div>
        <WatchlistToggle listingId={listing.listingId} removeLabel="取消自选" />
        <dl className={styles.quoteStats}>
          <div>
            <dt>今开</dt>
            <dd>{open.toFixed(2)}</dd>
          </div>
          <div>
            <dt>最高</dt>
            <dd>{high.toFixed(2)}</dd>
          </div>
          <div>
            <dt>最低</dt>
            <dd>{low.toFixed(2)}</dd>
          </div>
          <div>
            <dt>昨收</dt>
            <dd>{previousClose.toFixed(2)}</dd>
          </div>
          <div>
            <dt>成交量</dt>
            <dd>{marketSnapshot.volume}</dd>
          </div>
          <div>
            <dt>52 周最高</dt>
            <dd>{(price * (1 + marketSnapshot.weekHighOffset)).toFixed(2)}</dd>
          </div>
          <div>
            <dt>52 周最低</dt>
            <dd>{(price * (1 + marketSnapshot.weekLowOffset)).toFixed(2)}</dd>
          </div>
          <div>
            <dt>数据时点</dt>
            <dd>2026-08-07 14:20</dd>
          </div>
        </dl>
      </header>

      <section
        aria-labelledby="instrument-chart-heading"
        className={styles.chartPanel}
      >
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>MARKET SNAPSHOT</p>
            <h3 id="instrument-chart-heading">价格与成交量</h3>
          </div>
          <span>离线固定序列</span>
        </div>
        <div aria-label="图表周期" className={styles.periodControls}>
          {instrumentPeriodOptions.map((period) => (
            <button
              aria-pressed={activePeriod === period.id}
              key={period.id}
              onClick={() => setActivePeriod(period.id)}
              type="button"
            >
              {period.label}
            </button>
          ))}
        </div>
        <InstrumentDetailChart
          changePct={listing.changePct}
          instrumentName={listing.name}
          price={price}
          series={chartSeries}
        />
      </section>

      <section className={styles.detailPanel}>
        <div aria-label="标的资料" className={styles.detailTabs} role="tablist">
          {instrumentDetailTabs.map((tab) => (
            <button
              aria-controls={`instrument-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              id={`instrument-tab-${tab.id}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={handleDetailTabKeyDown}
              role="tab"
              tabIndex={activeTab === tab.id ? 0 : -1}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          aria-labelledby={`instrument-tab-${activeTab}`}
          className={styles.detailContent}
          id={`instrument-panel-${activeTab}`}
          role="tabpanel"
        >
          {activeTab === "discussion" ? (
            <div>
              <div className={styles.discussionToolbar}>
                <div aria-label="讨论排序" className={styles.sortControls}>
                  <button
                    aria-pressed={discussionSort === "latest"}
                    onClick={() => setDiscussionSort("latest")}
                    type="button"
                  >
                    最新
                  </button>
                  <button
                    aria-pressed={discussionSort === "hot"}
                    onClick={() => setDiscussionSort("hot")}
                    type="button"
                  >
                    最热
                  </button>
                </div>
                <Link href="/publish">＋ 发讨论</Link>
              </div>
              <div className={styles.postList}>
                {visiblePosts.map((post) => {
                  const followed = followedAuthors.includes(post.author);
                  const liked = likedPosts.includes(post.id);
                  return (
                    <article className={styles.postCard} key={post.id}>
                      <header>
                        <span aria-hidden="true" className={styles.avatar}>
                          {post.author.slice(0, 1)}
                        </span>
                        <div>
                          <strong>{post.author}</strong>
                          <time>{post.at}</time>
                        </div>
                        <button
                          aria-pressed={followed}
                          onClick={() =>
                            setFollowedAuthors((current) =>
                              toggleValue(current, post.author),
                            )
                          }
                          type="button"
                        >
                          {followed ? "已关注" : "关注"}
                        </button>
                      </header>
                      <h4>{post.title}</h4>
                      <p>{post.body}</p>
                      <footer>
                        <button
                          onClick={() => setNotice("分享功能暂未开放。")}
                          type="button"
                        >
                          分享
                        </button>
                        <button
                          onClick={() => setNotice("评论编辑器暂未开放。")}
                          type="button"
                        >
                          评论 {post.comments}
                        </button>
                        <button
                          aria-pressed={liked}
                          onClick={() =>
                            setLikedPosts((current) =>
                              toggleValue(current, post.id),
                            )
                          }
                          type="button"
                        >
                          点赞 {post.likes + (liked ? 1 : 0)}
                        </button>
                      </footer>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          {activeTab === "constituents" ? (
            <div
              aria-label={`${listing.name}固定合成成分横向滚动表格`}
              className={styles.tableScroller}
              role="region"
              tabIndex={0}
            >
              <table className={styles.dataTable}>
                <caption>{listing.name}固定合成成分</caption>
                <thead>
                  <tr>
                    <th scope="col">名称</th>
                    <th scope="col">代码</th>
                    <th scope="col">权重</th>
                    <th scope="col">涨跌幅</th>
                  </tr>
                </thead>
                <tbody>
                  {syntheticConstituents[listing.market].map((item) => (
                    <tr key={item.code}>
                      <th scope="row">{item.name}</th>
                      <td>{item.code}</td>
                      <td>{item.weight}</td>
                      <td>
                        <TrendValue value={item.changePct} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {activeTab === "news" ? (
            <div className={styles.newsList}>
              {syntheticInstrumentNews.map((item) => (
                <article key={item.id}>
                  <p>
                    {item.source} · <time>{item.at}</time>
                  </p>
                  <h4>{item.title}</h4>
                  <p>{item.summary}</p>
                </article>
              ))}
            </div>
          ) : null}

          {activeTab === "announcements" ? (
            <ul className={styles.announcementList}>
              {syntheticAnnouncements.map((item) => (
                <li key={item.id}>
                  <time>{item.date}</time>
                  <strong>{item.title}</strong>
                  <span>演示文件不可下载</span>
                </li>
              ))}
            </ul>
          ) : null}

          {activeTab === "etfs" ? (
            <div className={styles.etfGroups}>
              {syntheticRelatedEtfGroups.map((group) => (
                <section key={group.label}>
                  <h4>{group.label}</h4>
                  {group.items.map((item) => (
                    <Link
                      href={`/instruments/${item.targetListingId}`}
                      key={item.symbol}
                    >
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.symbol}</small>
                      </span>
                      <span>{item.price}</span>
                      <TrendValue value={item.changePct} />
                    </Link>
                  ))}
                </section>
              ))}
            </div>
          ) : null}
        </div>
        <p aria-live="polite" className={styles.statusNotice} role="status">
          {notice}
        </p>
      </section>

      <aside className={styles.disclosure}>
        <strong>固定合成数据</strong>
        <p>
          本页不连接真实行情、交易或开户服务，不构成投资建议，不提供交易能力。
          所有内容仅用于本地产品验收。
        </p>
      </aside>

      <nav aria-label="标的快捷操作" className={styles.bottomActions}>
        <Link href="/publish">发讨论</Link>
        <UnavailableAction label="问 AI" />
        <WatchlistToggle listingId={listing.listingId} removeLabel="取消自选" />
      </nav>
    </article>
  );
}
