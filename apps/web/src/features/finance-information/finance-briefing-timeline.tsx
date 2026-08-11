import Link from "next/link";

import {
  financeInformationItems,
  type FinanceInformationFixture,
} from "./finance-information-fixtures";
import styles from "./finance-information.module.css";

const briefsByDate = financeInformationItems
  .filter((item) => item.kind === "brief")
  .reduce<Map<string, readonly FinanceInformationFixture[]>>((groups, item) => {
    const date = item.publishedLabel.slice(0, 10);
    groups.set(date, [...(groups.get(date) ?? []), item]);
    return groups;
  }, new Map());

export function FinanceBriefingTimeline() {
  return (
    <section
      aria-labelledby="finance-briefing-heading"
      className={styles.pageStack}
      data-testid="finance-briefing-timeline"
    >
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>7 × 24 · FIXED BRIEFING TIMELINE</p>
          <h2 id="finance-briefing-heading">7×24 合成快讯</h2>
          <p>以绝对日期与时间回放固定离线市场事件。</p>
        </div>
        <div className={styles.disclosure}>
          <strong>演示数据 / 合成数据</strong>
          <span>非实时 · 不构成投资建议</span>
        </div>
      </header>

      <div className={styles.timelineDates}>
        {[...briefsByDate.entries()].map(([date, items]) => (
          <section
            aria-label={`${date} 快讯`}
            className={styles.timelineDay}
            key={date}
          >
            <header className={styles.timelineDateHeading}>
              <h3>{date}</h3>
              <span>{items.length} 条固定快讯</span>
            </header>
            <ol className={styles.timelineList}>
              {items.map((item) => (
                <li key={item.id}>
                  <time dateTime={item.publishedAt}>
                    {item.publishedLabel.slice(11)}
                  </time>
                  <div>
                    <h4>{item.title}</h4>
                    <p>
                      关联观察：{item.relatedListingNames.join(" · ")}
                      。本条不连接任何外部资讯源。
                    </p>
                    <Link href={`/news/${item.id}`}>查看快讯详情</Link>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </section>
  );
}
