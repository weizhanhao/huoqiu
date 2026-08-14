import { InstrumentLink } from "./instrument-link";
import styles from "./stock-rail.module.css";
import type { FundHolding } from "../../server/f10.server";
import type { SectorPeers } from "../../server/sector-peers.server";

/*
 * 个股页右栏。
 *
 * 站内此前整条右栏都没有：个股页只有左边一列分区导航和中间的行情，
 * 右侧一大片空着。
 *
 * 每一块都得有真数据才出现，三块都没有就整栏不渲染。留三个空壳标题
 * 看着像加载失败，而实际上是这只标的本来就没有那些资料——港美股拿不到
 * A 股的板块编号，也没有 F10。
 */

const WAN = 10_000;
const YI = 100_000_000;

/*
 * 相关基金最多列几条。
 *
 * 上游给多少就渲染多少的话，一只热门股能列出十几二十条，把右栏拉得
 * 老长，上面的简介和相关股票全被挤出视野。相关股票早就限了 6 条，
 * 这里当初漏了。
 */
const FUND_COUNT = 6;

const scaled = (value: number | null): string => {
  if (value === null) return "—";
  if (Math.abs(value) >= YI) return `${(value / YI).toFixed(2)} 亿`;
  if (Math.abs(value) >= WAN) return `${(value / WAN).toFixed(2)} 万`;
  return value.toFixed(2);
};

const percent = (value: number | null): string =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;

const tone = (value: number | null): string | undefined => {
  if (value === null || value === 0) return undefined;
  return value > 0 ? styles.up : styles.down;
};

/*
 * 哪几路是「没拿到」，而不是「拿到了、是空的」。
 *
 * 这两件事此前在界面上完全一样——都是那一块不出现。长鑫科技确实没有
 * 基金持股（2024 年上市，公募季报里还没披露），而 F10 接口挂掉时长得
 * 一模一样。查原始返回才分得出来，用户永远分不出来。
 */
export type RailFailures = Readonly<{
  peers: boolean;
  profile: boolean;
  shareholders: boolean;
}>;

const NOTHING_FAILED: RailFailures = {
  peers: false,
  profile: false,
  shareholders: false,
};

export function StockRail({
  failed = NOTHING_FAILED,
  fundHoldings,
  profile,
  sectorPeers,
}: Readonly<{
  failed?: RailFailures;
  fundHoldings: readonly FundHolding[];
  profile: string | null;
  sectorPeers: SectorPeers | null;
}>) {
  const hasProfile = profile !== null && profile.trim().length > 0;
  const funds = fundHoldings
    .filter(
      (holding) => holding.name !== null && holding.name.trim().length > 0,
    )
    .slice(0, FUND_COUNT);

  const anyFailed = failed.peers || failed.profile || failed.shareholders;
  // 三块都没有、也没有任何一路失败，就彻底不渲染，让正文占满宽度。
  if (!hasProfile && sectorPeers === null && funds.length === 0 && !anyFailed) {
    return null;
  }

  return (
    <aside aria-label="公司资料与相关标的" className={styles.rail}>
      {failed.profile ? (
        <section className={styles.card}>
          <h2 className={styles.heading}>简介</h2>
          <p className="page-state-message">公司简介暂时取不到。</p>
        </section>
      ) : null}

      {hasProfile ? (
        <section className={styles.card}>
          <h2 className={styles.heading}>简介</h2>
          {/*
            简介动辄上千字，右栏放不下，这里限高截断。不做展开交互：
            完整的一份就在「公司简介」那一页，左边导航点过去即可。
          */}
          <p className={styles.profile}>{profile}</p>
        </section>
      ) : null}

      {failed.peers ? (
        <section className={styles.card}>
          <h2 className={styles.heading}>相关股票</h2>
          <p className="page-state-message">同板块个股暂时取不到。</p>
        </section>
      ) : null}

      {sectorPeers === null ? null : (
        <section className={styles.card}>
          <h2 className={styles.heading}>
            相关股票
            {/* 说清楚凭什么相关，否则这一栏只是几只莫名其妙的股票。 */}
            <small className={styles.sector}>{sectorPeers.sectorName}</small>
          </h2>
          <ul className={styles.list}>
            {sectorPeers.peers.map((peer) => (
              <li className={styles.row} key={peer.symbol}>
                <InstrumentLink className={styles.peer} symbol={peer.symbol}>
                  <strong className={styles.peerName}>{peer.name}</strong>
                  <small className={styles.peerCode}>
                    {peer.symbol.slice(2)}
                  </small>
                </InstrumentLink>
                <span className={styles.peerQuote}>
                  <strong>
                    {peer.last === null ? "—" : peer.last.toFixed(2)}
                  </strong>
                  <small className={tone(peer.changePercent)}>
                    {percent(peer.changePercent)}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {failed.shareholders ? (
        <section className={styles.card}>
          <h2 className={styles.heading}>相关基金</h2>
          <p className="page-state-message">基金持股暂时取不到。</p>
        </section>
      ) : null}

      {funds.length === 0 ? null : (
        <section className={styles.card}>
          <h2 className={styles.heading}>相关基金</h2>
          <ul className={styles.list}>
            {funds.map((holding) => (
              <li
                className={styles.row}
                key={holding.fundCode ?? holding.name ?? ""}
              >
                <span className={styles.peer}>
                  <strong className={styles.peerName}>{holding.name}</strong>
                  {/*
                    持仓是季报口径，要标出报告期。不标的话，一份三个月前的
                    持仓看着就像此刻的持仓。
                  */}
                  <small className={styles.peerCode}>
                    {holding.reportedOn ?? "—"} 持股
                  </small>
                </span>
                <span className={styles.peerQuote}>
                  <strong>{scaled(holding.shares)}</strong>
                  <small>
                    {holding.ratio === null
                      ? "—"
                      : `占流通 ${holding.ratio.toFixed(2)}%`}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
