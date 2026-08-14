import { ScrollableTable } from "../../components/system/scrollable-table";
import styles from "./instrument-section.module.css";
import type { MoneyFlow, TickBoard } from "../../server/tick.server";

/*
 * 分时成交、分价表、资金流。
 *
 * 这三项站内此前标着「需要 Level-2 数据，免费源给不全」，链到腾讯去。
 * 那句话是错的：公开接口取得到。
 *
 * 但要说清楚取到的是什么。上游给的是**成交切片**，不是逐笔——同一天里
 * 没有任何两行落在同一秒，而真正的逐笔一秒内会有几十笔。每行第四列是
 * 该切片内的笔数。所以：
 *   · 「全天共 N 笔」用的是各切片笔数之和，不是行数；
 *   · 资金流那张表改用官方接口，不再由切片自行分档——自行分档的结果与
 *     官方口径在个股上符号相反。
 */

/** 明细页最多列这么多笔。再多没人往下翻，页面还会变得很沉。 */
const MAX_ROWS = 200;

const formatPrice = (value: number): string => value.toFixed(2);

const formatHands = (value: number): string => value.toLocaleString("zh-CN");

/** 元 → 万元。大单统计的数量级用万元读起来才不用数零。 */
const formatWan = (value: number): string => {
  const wan = value / 10_000;
  const sign = wan > 0 ? "+" : "";
  return `${sign}${wan.toFixed(2)}`;
};

const sideLabel = (side: "buy" | "sell"): string =>
  side === "buy" ? "买盘" : "卖盘";

/*
 * CSS Modules 的类名在类型上是 string | undefined——写错一个名字
 * 编译期不会报，运行时那一列就没有颜色。回落到空串，不让 undefined
 * 拼进 className。
 */
const sideClass = (side: "buy" | "sell"): string =>
  (side === "buy" ? styles.numericUp : styles.numericDown) ?? "";

function Unavailable({ what }: Readonly<{ what: string }>) {
  return (
    <p className={styles.prose}>
      {what}暂时取不到。这一项来自公开逐笔接口，上游没有响应时不显示旧数据，
      也不用估算值顶替。
    </p>
  );
}

function SourceNote({ board }: Readonly<{ board: TickBoard }>) {
  return (
    <p className={styles.disclosure}>
      数据来自公开分时成交接口
      {board.delayed ? "（当前为延时源）" : ""}，全天{" "}
      {board.trades.toLocaleString("zh-CN")} 笔成交，归入{" "}
      {board.ticks.length.toLocaleString("zh-CN")} 个切片。上游按秒聚合，
      一行是一个切片而不是一笔。买卖方向由上游标注：主动买计入买盘，
      主动卖计入卖盘；09:25 之前的集合竞价参考量与 15:01 之后的盘后成交
      都不计入当日成交，已剔除。
    </p>
  );
}

export function TicksSection({ board }: Readonly<{ board: TickBoard | null }>) {
  if (board === null) return <Unavailable what="成交明细" />;

  // 最近的在前：这一页是用来看「刚才成交了什么」的。
  const rows = board.ticks.slice(-MAX_ROWS).toReversed();

  return (
    <>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          分时成交
          <span className={styles.count}>最近 {rows.length} 个切片</span>
        </h2>
        <ScrollableTable className={styles.tableScroll} label="分时成交">
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">时间</th>
                <th className={styles.numeric} scope="col">
                  成交价
                </th>
                <th className={styles.numeric} scope="col">
                  手数
                </th>
                <th className={styles.numeric} scope="col">
                  笔数
                </th>
                <th scope="col">方向</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tick, index) => (
                <tr key={`${tick.at}-${index.toString()}`}>
                  <th scope="row">{tick.at}</th>
                  <td className={styles.numeric}>{formatPrice(tick.price)}</td>
                  <td className={styles.numeric}>
                    {formatHands(tick.volumeHands)}
                  </td>
                  {/*
                    一个切片里可能有上百笔。把它当成 1 笔，全天笔数会低十几倍。
                  */}
                  <td className={styles.numeric}>{formatHands(tick.trades)}</td>
                  <td className={sideClass(tick.side)}>
                    {sideLabel(tick.side)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      </section>
      <SourceNote board={board} />
    </>
  );
}

export function PriceLevelsSection({
  board,
}: Readonly<{ board: TickBoard | null }>) {
  if (board === null) return <Unavailable what="分价表" />;

  /*
   * 条形宽度按本表最大的那一档缩放。按总量缩放的话，成交最集中的价位
   * 也只占几个百分点，整张表会退化成一列几乎等长的短条。
   */
  const peak = Math.max(...board.levels.map((level) => level.totalHands), 1);

  return (
    <>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          分价表
          <span className={styles.count}>{board.levels.length} 档</span>
        </h2>
        <ScrollableTable className={styles.tableScroll} label="分价表">
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">成交价</th>
                <th className={styles.numeric} scope="col">
                  总手数
                </th>
                <th className={styles.numeric} scope="col">
                  买盘
                </th>
                <th className={styles.numeric} scope="col">
                  卖盘
                </th>
                <th scope="col">占比</th>
              </tr>
            </thead>
            <tbody>
              {board.levels.map((level) => (
                <tr key={level.price}>
                  <th scope="row">{formatPrice(level.price)}</th>
                  <td className={styles.numeric}>
                    {formatHands(level.totalHands)}
                  </td>
                  <td className={`${styles.numeric} ${styles.numericUp}`}>
                    {formatHands(level.buyHands)}
                  </td>
                  <td className={`${styles.numeric} ${styles.numericDown}`}>
                    {formatHands(level.sellHands)}
                  </td>
                  <td>
                    {/*
                      条形只是同一个数字的另一种读法，屏幕阅读器读左边那一列
                      就够了，所以这里对无障碍树隐藏。
                    */}
                    <span
                      aria-hidden="true"
                      className={styles.bar}
                      style={{
                        width: `${((level.totalHands / peak) * 100).toFixed(1)}%`,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      </section>
      <SourceNote board={board} />
    </>
  );
}

export function BlockOrdersSection({
  board,
  flow,
}: Readonly<{ board: TickBoard | null; flow: MoneyFlow | null }>) {
  if (flow === null) return <Unavailable what="资金流" />;

  return (
    <>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          资金流
          {flow.mainNetAmount === null ? null : (
            <span className={styles.count}>
              主力净{formatWan(flow.mainNetAmount)} 万元
            </span>
          )}
        </h2>
        <ScrollableTable className={styles.tableScroll} label="资金流">
          <table className={styles.table}>
            <caption className={styles.disclosure}>当日各档资金净流入</caption>
            <thead>
              <tr>
                <th scope="col">档位</th>
                <th className={styles.numeric} scope="col">
                  净额（万元）
                </th>
                <th className={styles.numeric} scope="col">
                  占成交额
                </th>
              </tr>
            </thead>
            <tbody>
              {flow.tiers.map((tier) => (
                <tr key={tier.slug}>
                  <th scope="row">{tier.label}</th>
                  <td
                    className={`${styles.numeric} ${
                      tier.netAmount >= 0
                        ? styles.numericUp
                        : styles.numericDown
                    }`}
                  >
                    {formatWan(tier.netAmount)}
                  </td>
                  <td
                    className={`${styles.numeric} ${
                      (tier.netPercent ?? 0) >= 0
                        ? styles.numericUp
                        : styles.numericDown
                    }`}
                  >
                    {tier.netPercent === null
                      ? "—"
                      : `${tier.netPercent > 0 ? "+" : ""}${tier.netPercent.toFixed(2)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      </section>
      <p className={styles.disclosure}>
        {/*
          必须说明这四个数是谁算的。
          站内自己按分时切片分过一次档，结果与官方口径在个股上符号相反——
          因为那份数据是按秒聚合的切片，不是单笔。所以这里直接用官方数值。
        */}
        分档由数据源按交易所口径给出，站内不再自行按成交额分档：公开的分时
        数据是按秒聚合的切片而非单笔，据它分档会得出与官方相反的方向。
        主力净流入等于超大单与大单之和；四档净额相加应为零。
      </p>
      {board === null ? null : <SourceNote board={board} />}
    </>
  );
}
