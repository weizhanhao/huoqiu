import Link from "next/link";

import { WatchlistToggle } from "../../components/watchlist/watchlist-toggle";

import styles from "./market-portfolio.module.css";
import type { SyntheticListing } from "./synthetic-data";

type SyntheticInstrumentDetailProperties = Readonly<{
  listing: SyntheticListing;
}>;

export function SyntheticInstrumentDetail({
  listing,
}: SyntheticInstrumentDetailProperties) {
  const isUp = listing.changePct >= 0;

  return (
    <article className={styles.instrumentDetail}>
      <Link className={styles.backLink} href="/markets">
        ← 行情中心
      </Link>
      <header className={styles.quotePanel}>
        <div>
          <p className={styles.kicker}>
            {listing.marketLabel} · {listing.symbol} · SYNTHETIC
          </p>
          <h2>{listing.name}</h2>
          <p>固定合成标的 · {listing.currency}</p>
        </div>
        <div className={styles.quoteValue}>
          <strong>{listing.price}</strong>
          <span className={isUp ? styles.up : styles.down}>
            {isUp ? "+" : ""}
            {listing.changePct.toFixed(2)}%
          </span>
        </div>
        <WatchlistToggle listingId={listing.listingId} />
      </header>
      <section className={styles.notice}>
        <strong>演示数据说明</strong>
        <p>
          本页读取 huoqiu-synthetic 固定快照，不连接真实行情，不提供交易能力，
          不构成投资建议。
        </p>
        <Link href="/markets/rankings">查看榜单</Link>
      </section>
    </article>
  );
}
