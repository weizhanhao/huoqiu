import styles from "./instrument-section.module.css";
import type {
  Announcements,
  CompanyOps,
  RelatedTrades,
} from "../../server/company-ops.server";

/*
 * 公司运作、股票交易与公告的分区共用这一个组件——它们来自同一份上游数据，
 * 把表格样板抄十遍不如按 slug 分发。
 *
 * 这里收到的比例已经是百分数（取数层把上游的小数换算过了）。
 * 上游没披露的格子是「—」，不是 0。
 */

const WAN = 10_000;
const YI = 100_000_000;

const formatYuan = (value: number | null | undefined): string => {
  if (value == null) return "—";
  const magnitude = Math.abs(value);
  if (magnitude >= YI) return `${(value / YI).toFixed(2)} 亿元`;
  if (magnitude >= WAN) return `${(value / WAN).toFixed(2)} 万元`;
  return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 元`;
};

const formatShares = (value: number | null | undefined): string => {
  if (value == null) return "—";
  const magnitude = Math.abs(value);
  if (magnitude >= YI) return `${(value / YI).toFixed(2)} 亿股`;
  if (magnitude >= WAN) return `${(value / WAN).toFixed(2)} 万股`;
  return `${value.toLocaleString("zh-CN")} 股`;
};

const formatPercent = (value: number | null | undefined): string =>
  value == null ? "—" : `${value.toFixed(2)}%`;

const formatPrice = (value: number | null | undefined): string =>
  value == null ? "—" : `${value.toFixed(2)} 元`;

const orDash = (value: string | null | undefined): string =>
  value === null || value === undefined || value.length === 0 ? "—" : value;

function Card({
  children,
  note,
  title,
}: Readonly<{
  children: React.ReactNode;
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

function NoneYet({ what }: Readonly<{ what: string }>) {
  return <p className={styles.prose}>按最新披露，当前没有{what}。</p>;
}

/*
 * 「这一段没取到」和「确实没有」是两回事。
 *
 * 三个上游接口各自独立，某一个超时时早先会把对应分区写成空数组，
 * 页面随即显示「当前没有披露的分红送配方案」——贵州茅台会被写成从未分红。
 */
function Unavailable({ what }: Readonly<{ what: string }>) {
  return (
    <p className={styles.prose}>
      {what}暂时取不到，稍后再试。这不表示该公司没有相关记录，
      本页也不使用样本数据代替真实披露。
    </p>
  );
}

/*
 * 公告列表。
 *
 * 每条都带真实可达的原文链接——公告标题没有链接就只是一行字，
 * 读者无从核对我们说的对不对。
 */
export function AnnouncementsSection({
  announcements,
  title,
}: Readonly<{ announcements: Announcements; title: string }>) {
  return (
    <Card note={`${announcements.items.length.toString()} 条`} title={title}>
      {announcements.items.length === 0 ? (
        <NoneYet what="披露的公告" />
      ) : (
        <ul className={styles.noticeList}>
          {announcements.items.map((item) => (
            <li className={styles.notice} key={item.href}>
              <a
                className={styles.noticeTitle}
                href={item.href}
                rel="noreferrer"
                target="_blank"
              >
                {orDash(item.title)}
              </a>
              <span className={styles.noticeMeta}>
                {orDash(item.noticedOn)}
                {item.category === null ? null : ` · ${item.category}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/*
 * 收入构成。
 *
 * 上游一次给一百多行，跨十几个报告期、三种统计口径（按行业/按产品/按地区）。
 * 全铺成一张表的话，「其他(补充)」会重复出现十几次而彼此无法区分，
 * 而卡片上那句「截至 2025-12-31」对其余一百多行都是假的——
 * 一条 2017 年的地区收入会被读成 2025 年年报口径。
 *
 * 所以只渲染最新一期，并按口径分成几张表。往期数据仍在，只是不堆在一起。
 */
function RevenueCard({ data }: Readonly<{ data: CompanyOps }>) {
  if (!data.available.business) {
    return (
      <Card title="收入构成">
        <Unavailable what="主营构成数据" />
      </Card>
    );
  }
  if (data.revenueMix.length === 0) {
    return (
      <Card title="收入构成">
        <NoneYet what="披露的主营构成" />
      </Card>
    );
  }

  /* 报告期按倒序排，取最新的一期。 */
  const periods = [
    ...new Set(
      data.revenueMix
        .map((slice) => slice.reportedOn)
        .filter((date): date is string => date !== null),
    ),
  ].sort((left, right) => right.localeCompare(left));
  const latest = periods[0] ?? null;
  const current = data.revenueMix.filter(
    (slice) => slice.reportedOn === latest,
  );

  /* 同一期内按口径分组，顺序固定。 */
  const scopes = ["按行业", "按产品", "按地区", "未标注"] as const;
  const groups = scopes
    .map((scope) => ({
      rows: current.filter((slice) => slice.scope === scope),
      scope,
    }))
    .filter((group) => group.rows.length > 0);

  return (
    <>
      {groups.map((group) => (
        <Card
          key={group.scope}
          note={latest === null ? undefined : `截至 ${latest}`}
          title={`收入构成（${group.scope}）`}
        >
          <Table
            columns={["项目", "营业收入", "占营收比", "营业成本", "毛利率"]}
            rows={group.rows.map((slice) => [
              orDash(slice.name),
              formatYuan(slice.income),
              formatPercent(slice.incomeRatio),
              formatYuan(slice.cost),
              formatPercent(slice.grossMargin),
            ])}
          />
        </Card>
      ))}
      {periods.length > 1 ? (
        <p className={styles.disclosure}>
          上表为最新一期（{latest}）的主营构成。上游同时给出了 {periods.length}{" "}
          个报告期的数据，本页只呈现最新一期，
          以免不同年份的口径混在一起被误读。
        </p>
      ) : null}
    </>
  );
}

/*
 * 关联交易。
 *
 * 与「高管增减持」不是一回事：那一份是董监高买卖自家股票，这一份是公司
 * 与关联方之间的交易。核对过两者确实来自不同数据集才单列一页。
 */
export function RelatedTradesSection({
  related,
}: Readonly<{ related: RelatedTrades }>) {
  return (
    <Card note={`${related.trades.length.toString()} 项`} title="内部交易">
      {related.trades.length === 0 ? (
        <NoneYet what="披露的关联交易" />
      ) : (
        <Table
          columns={[
            "公告日期",
            "交易方式",
            "关联方",
            "关联关系",
            "是否构成控制",
            "交易金额",
            "交易概述",
          ]}
          rows={related.trades.map((trade) => [
            orDash(trade.noticedOn),
            orDash(trade.way),
            orDash(trade.party),
            orDash(trade.relation),
            orDash(trade.isControlling),
            formatYuan(trade.amount),
            orDash(trade.profile),
          ])}
        />
      )}
    </Card>
  );
}

export function CompanyOpsSection({
  data,
  slug,
}: Readonly<{ data: CompanyOps; slug: string }>) {
  if (slug === "revenue") return <RevenueCard data={data} />;

  if (slug === "dividends") {
    return (
      <Card
        note={
          data.available.bonus
            ? `${data.dividends.length.toString()} 次`
            : undefined
        }
        title="分红送配"
      >
        {!data.available.bonus ? (
          <Unavailable what="分红送配数据" />
        ) : data.dividends.length === 0 ? (
          <NoneYet what="披露的分红送配方案" />
        ) : (
          <Table
            columns={[
              "公告日期",
              "分配方案",
              "进度",
              "股权登记日",
              "除权除息日",
            ]}
            rows={data.dividends.map((dividend) => [
              orDash(dividend.noticedOn),
              orDash(dividend.plan),
              orDash(dividend.progress),
              orDash(dividend.recordOn),
              orDash(dividend.exDividendOn),
            ])}
          />
        )}
      </Card>
    );
  }

  if (slug === "placements") {
    return (
      <Card title="增发一览">
        {!data.available.bonus ? (
          <Unavailable what="增发数据" />
        ) : data.placements.length === 0 ? (
          <NoneYet what="披露的增发记录" />
        ) : (
          <Table
            columns={[
              "发行日期",
              "发行方式",
              "发行价格",
              "发行数量",
              "募资净额",
            ]}
            rows={data.placements.map((placement) => [
              orDash(placement.issuedOn),
              orDash(placement.kind),
              formatPrice(placement.price),
              formatShares(placement.volume),
              formatYuan(placement.amount),
            ])}
          />
        )}
      </Card>
    );
  }

  if (slug === "events" || slug === "meetings") {
    return (
      <Card
        note={`${data.events.length.toString()} 项`}
        title={slug === "meetings" ? "股东大会与重要日程" : "重大事项"}
      >
        {data.events.length === 0 ? (
          !data.available.operations ? (
            <Unavailable what="重大事项数据" />
          ) : (
            <NoneYet what="披露的重要日程" />
          )
        ) : (
          <Table
            columns={["日期", "类别", "细项", "内容"]}
            rows={data.events.map((event) => [
              orDash(event.happensOn),
              orDash(event.kind),
              orDash(event.subKind),
              orDash(event.content),
            ])}
          />
        )}
      </Card>
    );
  }

  if (slug === "block-trades") {
    return (
      <Card note={`${data.blockTrades.length.toString()} 笔`} title="大宗交易">
        {data.blockTrades.length === 0 ? (
          !data.available.operations ? (
            <Unavailable what="大宗交易数据" />
          ) : (
            <NoneYet what="披露的大宗交易" />
          )
        ) : (
          <Table
            columns={[
              "交易日期",
              "成交价",
              "当日收盘价",
              "溢价率",
              "成交量",
              "成交额",
              "买方营业部",
              "卖方营业部",
            ]}
            rows={data.blockTrades.map((trade) => [
              orDash(trade.tradedOn),
              formatPrice(trade.price),
              formatPrice(trade.closePrice),
              formatPercent(trade.premiumRatio),
              formatShares(trade.volume),
              formatYuan(trade.amount),
              orDash(trade.buyer),
              orDash(trade.seller),
            ])}
          />
        )}
      </Card>
    );
  }

  if (slug === "top-list") {
    return (
      <Card note={`${data.topList.length.toString()} 次`} title="龙虎榜数据">
        {data.topList.length === 0 ? (
          !data.available.operations ? (
            <Unavailable what="龙虎榜数据" />
          ) : (
            <NoneYet what="上榜记录" />
          )
        ) : (
          <Table
            columns={[
              "上榜日期",
              "上榜原因",
              "买入总额",
              "买入占成交额",
              "卖出总额",
              "卖出占成交额",
            ]}
            rows={data.topList.map((entry) => [
              orDash(entry.tradedOn),
              orDash(entry.reason),
              formatYuan(entry.buyTotal),
              formatPercent(entry.buyRatio),
              formatYuan(entry.sellTotal),
              formatPercent(entry.sellRatio),
            ])}
          />
        )}
      </Card>
    );
  }

  return (
    <Card note={`${data.margin.length.toString()} 个交易日`} title="融资融券">
      {data.margin.length === 0 ? (
        <NoneYet what="融资融券数据" />
      ) : (
        <Table
          columns={[
            "交易日期",
            "融资买入额",
            "融资偿还额",
            "融资余额",
            "融券卖出量",
            "融券余额",
          ]}
          rows={data.margin.map((entry) => [
            orDash(entry.tradedOn),
            formatYuan(entry.financingBuy),
            formatYuan(entry.financingRepay),
            formatYuan(entry.financingBalance),
            formatShares(entry.securitiesSellVolume),
            formatYuan(entry.securitiesBalance),
          ])}
        />
      )}
    </Card>
  );
}
