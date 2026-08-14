import styles from "./instrument-section.module.css";
import type { InsiderTrades, Shareholders } from "../../server/f10.server";

/*
 * 股权信息的六个分区：股本结构、十大股东、十大流通股东、基金持股、
 * 股东人数、限售解禁。
 *
 * 它们共用同一份上游数据，所以做成一个按 slug 分发的组件——六个文件各自
 * 抄一遍表格样板，改一处表头就要改六个地方。
 *
 * 量纲是核对过的：股数为股，比例为百分数，金额为元，股东人数为户。
 * 上游没给的值渲染成「—」：那是「本期未披露」，与「值是 0」不是一回事，
 * 所以不拿 0 去顶。
 */

const WAN = 10_000;
const YI = 100_000_000;

/** 股数按中文习惯折算：过亿说亿，过万说万，否则原样。 */
const formatShares = (value: number | null | undefined): string => {
  if (value == null) return "—";
  if (Math.abs(value) >= YI) return `${(value / YI).toFixed(2)} 亿股`;
  if (Math.abs(value) >= WAN) return `${(value / WAN).toFixed(2)} 万股`;
  return `${value.toLocaleString("zh-CN")} 股`;
};

const formatYuan = (value: number | null | undefined): string => {
  if (value == null) return "—";
  if (Math.abs(value) >= YI) return `${(value / YI).toFixed(2)} 亿元`;
  if (Math.abs(value) >= WAN) return `${(value / WAN).toFixed(2)} 万元`;
  return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 元`;
};

const formatRatio = (value: number | null): string =>
  value == null ? "—" : `${value.toFixed(2)}%`;

const formatCount = (value: number | null | undefined): string =>
  value == null ? "—" : `${value.toLocaleString("zh-CN")} 户`;

const orDash = (value: string | null | undefined): string =>
  value === null || value === undefined || value.length === 0 ? "—" : value;

const asOf = (date: string | null | undefined): string | undefined =>
  date === null || date === undefined ? undefined : `截至 ${date}`;

function Card({
  children,
  note,
  title,
}: Readonly<{
  children: React.ReactNode;
  /*
   * 显式的 undefined 是合法输入：有些分区没有「截至某日」这个说法，
   * 那就不该硬造一个日期出来填进标题。
   */
  note?: string | undefined;
  title: string;
}>) {
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>
        {title}
        {note === undefined ? null : (
          <span className={styles.count}>{note}</span>
        )}
      </h2>
      {children}
    </section>
  );
}

function Table({
  columns,
  rows,
}: Readonly<{
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}>) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0] ?? ""}-${index.toString()}`}>
              {row.map((cell, cellIndex) =>
                cellIndex === 0 ? (
                  <th key={cellIndex} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={cellIndex}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 上游确实说「没有」时的说法，与「取不到」区分开。 */
function NoneYet({ what }: Readonly<{ what: string }>) {
  return <p className={styles.prose}>按最新披露，当前没有{what}。</p>;
}

function EquitySection({ data }: Readonly<{ data: Shareholders }>) {
  const structure = data.shareStructure;
  return (
    <>
      <Card note={asOf(structure?.endedOn)} title="股本结构">
        {structure === null ? (
          <NoneYet what="披露的股本结构" />
        ) : (
          /*
           * 三行，不是两行。
           * 上游把无限售流通股拆成了「十大流通股东持股」与「其余」两段，
           * 只渲染后者会让两行相加只有 79.69%，20.3% 的股本凭空消失。
           */
          <Table
            columns={["项目", "股数", "占总股本比例"]}
            rows={[
              [
                "限售流通股",
                formatShares(structure.limitedShares),
                formatRatio(structure.limitedRatio),
              ],
              [
                "十大流通股东持股",
                formatShares(structure.topFloatShares),
                formatRatio(structure.topFloatRatio),
              ],
              [
                "其余无限售流通股",
                formatShares(structure.unlimitedShares),
                formatRatio(structure.unlimitedRatio),
              ],
            ]}
          />
        )}
      </Card>
      {data.controller === null ? null : (
        <Card title="实际控制人">
          <Table
            columns={["名称", "持股比例"]}
            rows={[
              [
                orDash(data.controller.name),
                formatRatio(data.controller.ratio),
              ],
            ]}
          />
        </Card>
      )}
    </>
  );
}

function HoldersSection({
  data,
  isFloat,
}: Readonly<{ data: Shareholders; isFloat: boolean }>) {
  const holders = isFloat ? data.topFloatHolders : data.topHolders;
  return (
    <Card
      note={asOf(holders[0]?.endedOn)}
      title={isFloat ? "十大流通股东" : "十大股东"}
    >
      {holders.length === 0 ? (
        <NoneYet what={isFloat ? "披露的流通股东名单" : "披露的股东名单"} />
      ) : (
        <Table
          columns={[
            "名次",
            "股东名称",
            isFloat ? "股东性质" : "股份类型",
            "持股数",
            isFloat ? "占流通股比例" : "占总股本比例",
            "较上期变动",
          ]}
          rows={holders.map((holder) => [
            holder.rank === null ? "—" : holder.rank.toString(),
            orDash(holder.name),
            orDash(isFloat ? holder.holderType : holder.sharesType),
            formatShares(holder.shares),
            formatRatio(holder.ratio),
            orDash(holder.change),
          ])}
        />
      )}
    </Card>
  );
}

function FundHoldingsSection({ data }: Readonly<{ data: Shareholders }>) {
  return (
    <Card note={asOf(data.fundHoldings[0]?.reportedOn)} title="基金持股">
      {data.fundHoldings.length === 0 ? (
        <NoneYet what="披露的基金持股" />
      ) : (
        <Table
          columns={[
            "基金名称",
            "基金代码",
            "持股数",
            "持股市值",
            "占总股本比例",
          ]}
          rows={data.fundHoldings.map((fund) => [
            orDash(fund.name),
            orDash(fund.fundCode),
            formatShares(fund.shares),
            formatYuan(fund.value),
            formatRatio(fund.ratio),
          ])}
        />
      )}
    </Card>
  );
}

function HolderCountSection({ data }: Readonly<{ data: Shareholders }>) {
  return (
    <Card note={`${data.holderCounts.length.toString()} 期`} title="股东人数">
      {data.holderCounts.length === 0 ? (
        <NoneYet what="披露的股东人数" />
      ) : (
        <Table
          columns={[
            "截止日期",
            "股东人数",
            "较上期变动",
            "人均流通股",
            "人均持股金额",
            "筹码集中度",
          ]}
          rows={data.holderCounts.map((entry) => [
            orDash(entry.endedOn),
            formatCount(entry.total),
            formatRatio(entry.changeRatio),
            formatShares(entry.averageShares),
            formatYuan(entry.averageHoldAmount),
            orDash(entry.focus),
          ])}
        />
      )}
    </Card>
  );
}

function LockupSection({ data }: Readonly<{ data: Shareholders }>) {
  return (
    <Card title="限售解禁">
      {data.lockups.length === 0 ? (
        /*
         * 这是「确实没有」，不是「取不到」。
         * 上游给了一个空的解禁列表，那本身就是答案。
         */
        <NoneYet what="待解禁的限售股安排" />
      ) : (
        <Table
          columns={["解禁日期", "解禁数量", "占总股本比例", "解禁类型"]}
          rows={data.lockups.map((lockup) => [
            orDash(lockup.releasedOn),
            formatShares(lockup.shares),
            formatRatio(lockup.ratio),
            orDash(lockup.type),
          ])}
        />
      )}
    </Card>
  );
}

/*
 * 高管增减持。
 *
 * 「增持 / 减持」直接由股数的正负号决定，不另外造一个字段——
 * 判断口径只有一处，就不会出现表格说增持、数字是负数这种自相矛盾。
 */
function InsiderTradesSection({ data }: Readonly<{ data: InsiderTrades }>) {
  return (
    <Card note={`${data.trades.length.toString()} 条`} title="高管增减持">
      {data.trades.length === 0 ? (
        <NoneYet what="披露的高管增减持记录" />
      ) : (
        <Table
          columns={[
            "变动日期",
            "变动人",
            "职务",
            "与董监高关系",
            "方向",
            "变动股数",
            "成交均价",
            "变动金额",
            "变动后持股",
            "变动原因",
          ]}
          rows={data.trades.map((trade) => [
            orDash(trade.changedOn),
            orDash(trade.name),
            orDash(trade.position),
            orDash(trade.relation),
            trade.shares === null ? "—" : trade.shares < 0 ? "减持" : "增持",
            formatShares(
              trade.shares === null ? null : Math.abs(trade.shares),
            ),
            trade.averagePrice === null
              ? "—"
              : `${trade.averagePrice.toString()} 元`,
            formatYuan(trade.amount === null ? null : Math.abs(trade.amount)),
            formatShares(trade.heldAfter),
            orDash(trade.reason),
          ])}
        />
      )}
    </Card>
  );
}

export function InsiderSection({ data }: Readonly<{ data: InsiderTrades }>) {
  return <InsiderTradesSection data={data} />;
}

export function ShareholderSection({
  data,
  slug,
}: Readonly<{ data: Shareholders; slug: string }>) {
  if (slug === "equity") return <EquitySection data={data} />;
  if (slug === "holders") return <HoldersSection data={data} isFloat={false} />;
  if (slug === "float-holders") {
    return <HoldersSection data={data} isFloat />;
  }
  if (slug === "fund-holdings") return <FundHoldingsSection data={data} />;
  if (slug === "holder-count") return <HolderCountSection data={data} />;
  return <LockupSection data={data} />;
}
