import { InstrumentLink } from "./instrument-link";
import styles from "./instrument-hits.module.css";
import type { SearchHit } from "../../server/search.server";

/*
 * 搜索页的标的结果。
 *
 * 这一段此前渲染的是 D0 夹具里的虚构公司——搜「茅台」一条都搜不到，
 * 搜出来的是「星海智造」，点进去 404。而真实的标的搜索一直都在
 * （searchInstruments，顶栏搜索框走的就是它），只是没接到这一页上。
 *
 * 三种结果分开说：搜到了、搜了但没有、上游没答应。后两种混为一谈，
 * 用户会把「上游挂了」读成「这只股票不存在」，然后再也不搜了。
 */

export function InstrumentHits({
  hits,
  query,
}: Readonly<{
  /** null 表示上游没答应，空数组表示确实没有。 */
  hits: readonly SearchHit[] | null;
  query: string;
}>) {
  return (
    <section aria-labelledby="instrument-hits-heading" className={styles.panel}>
      <h2 className={styles.heading} id="instrument-hits-heading">
        标的
      </h2>

      {hits === null ? (
        <p className="page-state-message">标的搜索暂时取不到，请稍后再试。</p>
      ) : null}

      {/* 还没搜就什么都不说——此时显示「没有找到」是在回答一个没问过的问题。 */}
      {hits !== null && hits.length === 0 && query.trim().length > 0 ? (
        <p className="page-state-message">没有找到匹配的标的。</p>
      ) : null}

      {hits !== null && hits.length > 0 ? (
        <ul className={styles.list}>
          {hits.map((entry) => {
            const label = (
              <>
                <strong className={styles.name}>{entry.name}</strong>
                <small className={styles.meta}>
                  {entry.code} · {entry.kind}
                </small>
              </>
            );
            return (
              <li className={styles.item} key={`${entry.kind}-${entry.code}`}>
                {/*
                  站内渲染不出来的标的照样列出来——用户至少知道它存在、
                  代码是多少，好过整条藏掉让人以为自己搜错了。
                  只是它不该是一条点开就 404 的链接。
                */}
                {entry.symbol === null ? (
                  <span className={styles.plain}>{label}</span>
                ) : (
                  <InstrumentLink className={styles.link} symbol={entry.symbol}>
                    {label}
                  </InstrumentLink>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
