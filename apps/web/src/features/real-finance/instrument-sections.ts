/*
 * 标的详情的七个分区。
 *
 * 三十来个子页如果各建一个页面文件，分区定义就散在三十处，加一项要改好几个
 * 地方。这里做成唯一真相：导航、路由参数、页面标题都从它派生。
 *
 * status 是刻意加的一列：
 *   ready    —— 已用真实数据做出来
 *   planned  —— 还没做。导航上如实标注，而不是渲染成看起来能用的样子
 *   external —— 数据在站外，给真实可达的外链，不做一个假装是自己的页面
 *   site     —— 站内的独立页面，不属于这只标的（选股器是跨标的的）
 *
 * 少了这一列，导航会把三十项渲染得一模一样，用户点进去才发现一半是空的。
 */

export type SectionStatus = "external" | "planned" | "ready" | "site";

export type InstrumentSection = Readonly<{
  /** external 时必填：真实可达的站外地址，{code} 换成不带前缀的六位代码。 */
  externalHref?: string;
  label: string;
  /** site 时必填：站内独立页面的地址。 */
  siteHref?: string;
  slug: string;
  status: SectionStatus;
}>;

export type InstrumentSectionGroup = Readonly<{
  items: readonly InstrumentSection[];
  title: string;
}>;

export const instrumentSectionGroups: readonly InstrumentSectionGroup[] = [
  {
    items: [
      { label: "公司简介", slug: "profile", status: "ready" },
      { label: "公司高管", slug: "executives", status: "ready" },
    ],
    title: "公司概况",
  },
  {
    items: [
      { label: "股本结构", slug: "equity", status: "ready" },
      { label: "十大股东", slug: "holders", status: "ready" },
      { label: "十大流通股东", slug: "float-holders", status: "ready" },
      { label: "基金持股", slug: "fund-holdings", status: "ready" },
      { label: "高管增减持", slug: "insider-trades", status: "ready" },
      { label: "股东人数", slug: "holder-count", status: "ready" },
      { label: "限售解禁", slug: "lockup", status: "ready" },
    ],
    title: "股权信息",
  },
  {
    items: [
      /*
       * 这三项此前标着「需要逐笔与 Level-2 数据，免费源给不全」，链到腾讯去。
       * 那句话是错的——公开接口取得到。
       *
       * 但名字要对得上取到的东西：上游给的是按秒聚合的**成交切片**，
       * 不是逐笔，所以叫「分时成交」而不是「成交明细」；而分档数据直接用
       * 官方资金流，不由切片自行分档，所以叫「资金流」而不是「大单统计」。
       */
      { label: "分时成交", slug: "ticks", status: "ready" },
      { label: "分价表", slug: "price-levels", status: "ready" },
      { label: "资金流", slug: "block-orders", status: "ready" },
      { label: "大宗交易", slug: "block-trades", status: "ready" },
      { label: "龙虎榜数据", slug: "top-list", status: "ready" },
      { label: "融资融券", slug: "margin", status: "ready" },
    ],
    title: "股票交易",
  },
  {
    items: [
      { label: "最新公告", slug: "announcements", status: "ready" },
      {
        /*
         * 上游的 f_node=1 是「财务报告」大类，含季报、分配方案、
         * 股东会决议、业绩预告，不只是年度报告。标成「年度报告」名实不符。
         */
        label: "财务报告",
        slug: "annual-reports",
        status: "ready",
      },
    ],
    title: "公司公告",
  },
  {
    items: [
      { label: "股东大会", slug: "meetings", status: "ready" },
      { label: "收入构成", slug: "revenue", status: "ready" },
      { label: "重大事项", slug: "events", status: "ready" },
      { label: "分红送配", slug: "dividends", status: "ready" },
      { label: "增发一览", slug: "placements", status: "ready" },
      { label: "内部交易", slug: "internal-trades", status: "ready" },
    ],
    title: "公司运作",
  },
  {
    items: [
      { label: "业绩预告", slug: "forecast", status: "ready" },
      { label: "主要指标", slug: "metrics", status: "ready" },
      { label: "利润表", slug: "income", status: "ready" },
      { label: "资产负债表", slug: "balance", status: "ready" },
      { label: "现金流量表", slug: "cashflow", status: "ready" },
      {
        /*
         * 所有者权益变动表没有稳定的免费结构化接口。
         * 雪球这一项本身也是跳站外，我们同样给法定披露源的真实地址，
         * 而不是拼一张自己算出来的表。
         */
        externalHref:
          "https://www.cninfo.com.cn/new/fulltextSearch?keyWord={code}",
        label: "所有者权益变动",
        slug: "equity-change",
        status: "external",
      },
      {
        /*
         * 选股器是跨标的的，不是这只股票的一个分区——
         * 所以它指向站内的独立页面，而不是 /instruments/<code>/screener。
         */
        label: "火球选股器",
        siteHref: "/screener",
        slug: "screener",
        status: "site",
      },
    ],
    title: "财务数据",
  },
  {
    items: [
      { label: "杜邦分析", slug: "dupont", status: "ready" },
      { label: "研究报告", slug: "research", status: "ready" },
    ],
    title: "研究分析",
  },
];

/** 全部分区拍平，供路由参数与查找使用。 */
export const instrumentSections: readonly InstrumentSection[] =
  instrumentSectionGroups.flatMap((group) => group.items);

export const findInstrumentSection = (slug: string): InstrumentSection | null =>
  instrumentSections.find((section) => section.slug === slug) ?? null;

/** sz300862 → 300862：外链站点用的是不带市场前缀的六位代码。 */
export const bareCode = (symbol: string): string =>
  symbol.replace(/^(sh|sz)/u, "");

/*
 * 这三十个分区只对「一家公司」成立。
 *
 * 指数没有公司简介、没有高管、没有十大股东。把分区导航挂到上证指数上，
 * 点进去看到的会是一片空白——而空白读起来像「这个标的没披露」，
 * 不像「这个标的根本没有这种东西」。
 *
 * 沪市个股以 6 开头（60 主板 / 68 科创板），深市个股以 00 或 30 开头
 * （000/001/002/003 主板中小板、300/301 创业板）；沪市 000/沪深 39 开头的是指数。
 */
const COMPANY_PATTERN = /^(sh6|sz00|sz30)\d{4,5}$/u;

export const isCompanyListing = (symbol: string): boolean =>
  COMPANY_PATTERN.test(symbol) && symbol.length === 8;
