import type { Metadata } from "next";

import { CompanyExecutivesSection } from "../../../../features/real-finance/company-executives-section";
import {
  AnnouncementsSection,
  CompanyOpsSection,
  RelatedTradesSection,
} from "../../../../features/real-finance/company-ops-sections";
import { CompanyProfileSection } from "../../../../features/real-finance/company-profile-section";
import {
  InsiderSection,
  ShareholderSection,
} from "../../../../features/real-finance/shareholder-sections";
import {
  DupontSection,
  ResearchReportsSection,
} from "../../../../features/real-finance/research-sections";
import {
  ForecastSection,
  StatementSection,
} from "../../../../features/real-finance/statement-section";
import {
  BlockOrdersSection,
  PriceLevelsSection,
  TicksSection,
} from "../../../../features/real-finance/tick-sections";
import styles from "../../../../features/real-finance/instrument-section.module.css";
import { findInstrumentSection } from "../../../../features/real-finance/instrument-sections";
import {
  loadCompanyExecutives,
  loadCompanyProfile,
  loadInsiderTrades,
  loadShareholders,
  type CompanyExecutives,
  type CompanyProfile,
  type InsiderTrades,
  type Shareholders,
} from "../../../../server/f10.server";
import {
  loadAnnouncements,
  loadCompanyOps,
  loadRelatedTrades,
  loadResearchReports,
  type AnnouncementScope,
  type Announcements,
  type CompanyOps,
  type RelatedTrades,
  type ResearchReports,
} from "../../../../server/company-ops.server";
import {
  loadEarningsForecast,
  loadStatement,
  type EarningsForecast,
  type FinancialStatement,
  type StatementKind,
} from "../../../../server/financials.server";
import { loadInstrumentSnapshot } from "../../../../server/market-quote.server";
import {
  loadMoneyFlow,
  loadTickBoard,
  type MoneyFlow,
  type TickBoard,
} from "../../../../server/tick.server";

/*
 * 标的详情的分区子页。
 *
 * 三十来个分区不各建一个页面文件——分区定义在 instrument-sections.ts 里只有
 * 一处真相，这里按 slug 取出来渲染。
 *
 * 只有 ready 的分区可达：planned 的还没实现，external 的数据在站外，
 * 两者都不该在站内摆出一个空壳页面假装有内容，所以直接 404。
 */
export const dynamic = "force-dynamic";

type SectionPageProperties = Readonly<{
  params: Promise<Readonly<{ listingId: string; section: string }>>;
}>;

/*
 * 每个 ready 分区取自己的那一份数据。
 *
 * 判别式联合而不是「一个装着所有分区数据的大对象」：后者会让渲染处不得不
 * 一路做非空判断，而且很容易演变成「这一页顺手把别的分区的接口也打了」。
 */
type SectionContent =
  | Readonly<{ kind: "executives"; value: CompanyExecutives | null }>
  | Readonly<{ kind: "profile"; value: CompanyProfile | null }>
  | Readonly<{ kind: "insider"; value: InsiderTrades | null }>
  | Readonly<{ kind: "shareholders"; value: Shareholders | null }>
  | Readonly<{ kind: "announcements"; value: Announcements | null }>
  | Readonly<{ kind: "forecast"; value: EarningsForecast | null }>
  | Readonly<{ kind: "dupont"; value: FinancialStatement | null }>
  | Readonly<{ kind: "ops"; value: CompanyOps | null }>
  | Readonly<{ kind: "related"; value: RelatedTrades | null }>
  | Readonly<{ kind: "research"; value: ResearchReports | null }>
  | Readonly<{ kind: "statement"; value: FinancialStatement | null }>
  | Readonly<{
      flow: MoneyFlow | null;
      kind: "ticks";
      value: TickBoard | null;
    }>;

/*
 * 成交明细、分价表、大单统计共用同一份逐笔数据。
 *
 * 这三项此前标着「需要 Level-2 数据，免费源给不全」并链到站外——
 * 那句话是错的，公开逐笔接口就能取到全天成交。
 */
const TICK_SLUGS = new Set(["block-orders", "price-levels", "ticks"]);

/*
 * 股权信息那一组六个分区共用同一份上游数据，
 * 取一次、缓存一份，六个页面都从它渲染。
 */
const SHAREHOLDER_SLUGS = new Set([
  "equity",
  "float-holders",
  "fund-holdings",
  "holder-count",
  "holders",
  "lockup",
]);

/*
 * 公司运作与股票交易的这些分区共用同一份上游数据，
 * 取一次、缓存一份，各页从它渲染。
 */
const OPS_SLUGS = new Set([
  "block-trades",
  "dividends",
  "events",
  "margin",
  "placements",
  "revenue",
  "top-list",
]);

/* 四张报表各自独立取数、独立缓存，slug 与表种一一对应。 */
const STATEMENT_SLUGS: Readonly<Record<string, StatementKind>> = {
  balance: "balance",
  cashflow: "cashflow",
  income: "income",
  metrics: "metrics",
};

const loadSectionContent = async (
  slug: string,
  listingId: string,
): Promise<SectionContent> => {
  if (TICK_SLUGS.has(slug)) {
    /*
     * 资金流只有大单统计那一页要。另外两页不取，省一次上游请求。
     */
    const [value, flow] = await Promise.all([
      loadTickBoard(listingId),
      slug === "block-orders" ? loadMoneyFlow(listingId) : null,
    ]);
    return { flow, kind: "ticks", value };
  }
  if (slug === "executives") {
    return {
      kind: "executives",
      value: await loadCompanyExecutives(listingId),
    };
  }
  if (slug === "insider-trades") {
    return { kind: "insider", value: await loadInsiderTrades(listingId) };
  }
  /*
   * 股东大会走公告接口按类目筛。
   * 上游没有专门的股东大会数据集，大事提醒里也一条都没有——
   * 早先拿大事提醒（龙虎榜、融资融券）冒充过，那是空壳。
   */
  const ANNOUNCEMENT_SCOPES: Readonly<Record<string, AnnouncementScope>> = {
    announcements: "latest",
    "annual-reports": "periodic",
    meetings: "meetings",
  };
  const announcementScope = ANNOUNCEMENT_SCOPES[slug];
  if (announcementScope !== undefined) {
    return {
      kind: "announcements",
      value: await loadAnnouncements(listingId, announcementScope),
    };
  }
  if (OPS_SLUGS.has(slug)) {
    return { kind: "ops", value: await loadCompanyOps(listingId) };
  }
  if (slug === "internal-trades") {
    return { kind: "related", value: await loadRelatedTrades(listingId) };
  }
  if (slug === "research") {
    return { kind: "research", value: await loadResearchReports(listingId) };
  }
  if (slug === "dupont") {
    /*
     * 杜邦分析的四个分量都在「主要指标」里，不需要另开一路请求——
     * 这一页和主要指标页共用同一份缓存。
     */
    return { kind: "dupont", value: await loadStatement(listingId, "metrics") };
  }
  if (slug === "forecast") {
    return { kind: "forecast", value: await loadEarningsForecast(listingId) };
  }
  const statementKind = STATEMENT_SLUGS[slug];
  if (statementKind !== undefined) {
    return {
      kind: "statement",
      value: await loadStatement(listingId, statementKind),
    };
  }
  if (SHAREHOLDER_SLUGS.has(slug)) {
    return { kind: "shareholders", value: await loadShareholders(listingId) };
  }
  return { kind: "profile", value: await loadCompanyProfile(listingId) };
};

/*
 * 上游这一次没给数据时说清楚是「取不到」，不是「这家公司没有」——
 * 更不能拿样本数据顶上。
 */
function SectionBody({
  content,
  slug,
}: Readonly<{ content: SectionContent; slug: string }>) {
  if (content.value === null) {
    return (
      <section className={styles.card}>
        <p className={styles.prose}>
          这一项暂时取不到，稍后再试。本页不使用样本数据代替真实资料。
        </p>
      </section>
    );
  }
  if (content.kind === "ticks") {
    if (slug === "price-levels") {
      return <PriceLevelsSection board={content.value} />;
    }
    if (slug === "block-orders") {
      return <BlockOrdersSection board={content.value} flow={content.flow} />;
    }
    return <TicksSection board={content.value} />;
  }
  if (content.kind === "executives") {
    return <CompanyExecutivesSection executives={content.value} />;
  }
  if (content.kind === "insider") {
    return <InsiderSection data={content.value} />;
  }
  if (content.kind === "announcements") {
    return (
      <AnnouncementsSection
        announcements={content.value}
        title={
          slug === "annual-reports"
            ? "财务报告"
            : slug === "meetings"
              ? "股东大会"
              : "最新公告"
        }
      />
    );
  }
  if (content.kind === "related") {
    return <RelatedTradesSection related={content.value} />;
  }
  if (content.kind === "research") {
    return <ResearchReportsSection research={content.value} />;
  }
  if (content.kind === "dupont") {
    return <DupontSection metrics={content.value} />;
  }
  if (content.kind === "ops") {
    return <CompanyOpsSection data={content.value} slug={slug} />;
  }
  if (content.kind === "forecast") {
    return <ForecastSection forecast={content.value} />;
  }
  if (content.kind === "statement") {
    return <StatementSection statement={content.value} />;
  }
  if (content.kind === "shareholders") {
    return <ShareholderSection data={content.value} slug={slug} />;
  }
  return <CompanyProfileSection profile={content.value} />;
}

export async function generateMetadata({
  params,
}: SectionPageProperties): Promise<Metadata> {
  const { listingId, section: slug } = await params;
  const section = findInstrumentSection(slug);
  if (section === null || section.status !== "ready") {
    return { title: "标的详情 · 火球" };
  }

  const snapshot = await loadInstrumentSnapshot(listingId);
  if (snapshot === null) {
    return { title: `${section.label} · 火球` };
  }
  return {
    description: `${snapshot.name}（${snapshot.symbol}）的${section.label}`,
    title: `${snapshot.name} ${section.label} · 火球`,
  };
}

export default async function InstrumentSectionPage({
  params,
}: SectionPageProperties) {
  const { listingId, section: slug } = await params;
  /*
   * 三条校验（分区存不存在、是不是沪深个股、代码在不在）都在同级的
   * layout 里做完了——必须在那儿，因为 notFound() 落到 loading 边界
   * 之下会用 200 送出 404 页面。这里只管渲染。
   */
  const section = findInstrumentSection(slug);
  if (section === null) return null;

  /*
   * 只取这个分区要的那一份。
   *
   * 一次把所有分区的数据都拉回来，等于每打开一个页面就去打好几个免费接口，
   * 其中绝大部分内容当前这一页根本不会渲染。
   */
  const content = await loadSectionContent(section.slug, listingId);

  return (
    /*
     * 外壳在 layout 里，这里只给正文那一列。
     *
     * 此前每个分区页各自渲染一遍 StockShell——点一次导航就是一组全新的
     * DOM 节点，容器宽度稍有出入就是一次硬跳。
     */
    <div className={styles.content}>
      {/*
          分区名是这一页的副标题，不是另一个 h1——一页两个 h1，靠标题
          导航的人分不清哪个才是主体。
        */}
      <h2 className={styles.heading}>{section.label}</h2>

      <SectionBody content={content} slug={section.slug} />

      <p className={styles.disclosure}>
        按公司披露口径，非实时。
      </p>
    </div>
  );
}
