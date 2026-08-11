export type FinanceInformationKind =
  "brief" | "company" | "announcement" | "column";

export type FinanceInformationChannel =
  "all" | "market" | "company" | "announcement" | "column";

export const financeInformationKindLabels = {
  announcement: "合成公告",
  brief: "合成快讯",
  column: "深度专栏",
  company: "公司新闻",
} as const satisfies Readonly<Record<FinanceInformationKind, string>>;

export const financeInformationChannels = [
  { id: "all", label: "全部" },
  { id: "market", label: "市场" },
  { id: "company", label: "公司" },
  { id: "announcement", label: "公告" },
  { id: "column", label: "专栏" },
] as const satisfies readonly Readonly<{
  id: FinanceInformationChannel;
  label: string;
}>[];

export type FinanceInformationFixture = Readonly<{
  body: readonly string[];
  channel: Exclude<FinanceInformationChannel, "all">;
  id: string;
  kind: FinanceInformationKind;
  publishedAt: string;
  publishedLabel: string;
  relatedListings: readonly Readonly<{
    listingId: string;
    name: string;
    symbol: string;
  }>[];
  relatedListingNames: readonly string[];
  sourceLabel: "火球合成资料库";
  summary: string;
  synthetic: true;
  title: string;
  topics: readonly string[];
}>;

export const financeInformationItems = [
  {
    body: [
      "固定样本显示，午后上涨合成标的数量较上午增加，但板块之间仍保持明显分化。",
      "该观察只用于演示资讯与行情关联能力，不代表任何真实市场或可交易价格。",
    ],
    channel: "market",
    id: "brief_syn_afternoon_pulse",
    kind: "brief",
    publishedAt: "2026-08-08T06:32:00.000Z",
    publishedLabel: "2026-08-08 14:32 CST",
    relatedListings: [
      {
        listingId: "listing_syn_0002",
        name: "星港制造",
        symbol: "SYN002",
      },
      {
        listingId: "listing_syn_0001",
        name: "合成示例一号",
        symbol: "SYN001",
      },
    ],
    relatedListingNames: ["星港制造", "合成示例一号"],
    sourceLabel: "火球合成资料库",
    summary: "固定行情观察池午后热度回升，先进制造方向相对活跃。",
    synthetic: true,
    title: "午后合成市场热度回升",
    topics: ["市场宽度", "午后观察"],
  },
  {
    body: [
      "星港制造的固定订单景气样本连续第三期位于合成景气区间，交付节奏与上一期基本一致。",
      "本内容由原创合成标的与离线参数生成，不引用公司公告、媒体报道或真实经营数据。",
    ],
    channel: "company",
    id: "company_syn_starport_orders",
    kind: "company",
    publishedAt: "2026-08-08T05:42:00.000Z",
    publishedLabel: "2026-08-08 13:42 CST",
    relatedListings: [
      {
        listingId: "listing_syn_0002",
        name: "星港制造",
        symbol: "SYN002",
      },
    ],
    relatedListingNames: ["星港制造", "SYN002"],
    sourceLabel: "火球合成资料库",
    summary: "离线经营样本显示订单景气参数保持在固定演示区间。",
    synthetic: true,
    title: "星港制造合成订单样本保持韧性",
    topics: ["先进制造", "订单观察"],
  },
  {
    body: [
      "本次更新统一了订单、交付与库存三个合成字段的展示口径，历史演示结果不会追溯调整。",
      "参数只服务产品交互验收，不能用于推断任何真实主体的经营状况。",
    ],
    channel: "announcement",
    id: "announcement_syn_parameter_update",
    kind: "announcement",
    publishedAt: "2026-08-08T04:05:00.000Z",
    publishedLabel: "2026-08-08 12:05 CST",
    relatedListings: [
      {
        listingId: "listing_syn_0002",
        name: "星港制造",
        symbol: "SYN002",
      },
    ],
    relatedListingNames: ["星港制造", "SYN002"],
    sourceLabel: "火球合成资料库",
    summary: "固定 Fixture 参数版本升级，展示口径保持可复现。",
    synthetic: true,
    title: "固定合成样本参数更新说明",
    topics: ["参数说明", "演示公告"],
  },
  {
    body: [
      "固定观察池的上涨家数占比回升，但涨幅主要集中在少数合成科技样本。",
      "专栏只解释演示指标的阅读方式，不提供收益预测、标的推荐或交易建议。",
    ],
    channel: "column",
    id: "column_syn_market_structure",
    kind: "column",
    publishedAt: "2026-08-08T02:26:00.000Z",
    publishedLabel: "2026-08-08 10:26 CST",
    relatedListings: [
      {
        listingId: "listing_syn_0006",
        name: "纳斯达克合成云",
        symbol: "SYN006",
      },
    ],
    relatedListingNames: ["纳斯达克合成云", "SYN006"],
    sourceLabel: "火球合成资料库",
    summary: "用上涨家数与板块贡献拆解固定合成观察池的结构。",
    synthetic: true,
    title: "从市场宽度观察合成结构变化",
    topics: ["市场宽度", "结构观察"],
  },
  {
    body: [
      "开盘固定快照中，合成科技样本偏强，稳健样本波动较小，观察池整体涨跌互现。",
      "快讯不是实时播报，时间和数值均来自可复现的离线 Fixture。",
    ],
    channel: "market",
    id: "brief_syn_morning_open",
    kind: "brief",
    publishedAt: "2026-08-08T01:18:00.000Z",
    publishedLabel: "2026-08-08 09:18 CST",
    relatedListings: [
      {
        listingId: "listing_syn_0006",
        name: "纳斯达克合成云",
        symbol: "SYN006",
      },
    ],
    relatedListingNames: ["纳斯达克合成云", "SYN006"],
    sourceLabel: "火球合成资料库",
    summary: "固定开盘样本呈现板块分化，合成科技方向相对活跃。",
    synthetic: true,
    title: "开盘合成观察池涨跌分化",
    topics: ["开盘观察", "科技样本"],
  },
  {
    body: [
      "前一日收盘快照中，全球航运样本的日内振幅高于固定观察池中位数。",
      "该结果仅用于演示跨日期快讯分组，既不对应真实证券，也不构成投资建议。",
    ],
    channel: "market",
    id: "brief_syn_previous_close",
    kind: "brief",
    publishedAt: "2026-08-07T10:05:00.000Z",
    publishedLabel: "2026-08-07 18:05 CST",
    relatedListings: [
      {
        listingId: "listing_syn_0009",
        name: "全球航运",
        symbol: "SYN009",
      },
    ],
    relatedListingNames: ["全球航运", "SYN009"],
    sourceLabel: "火球合成资料库",
    summary: "固定收盘样本显示航运方向波动扩大，用于跨日回放。",
    synthetic: true,
    title: "前一日合成航运样本波动扩大",
    topics: ["收盘回放", "航运样本"],
  },
] as const satisfies readonly FinanceInformationFixture[];

type FinanceInformationQuery = Readonly<{
  channel: FinanceInformationChannel;
  query?: string;
}>;

export function queryFinanceInformation({
  channel,
  query = "",
}: FinanceInformationQuery): readonly FinanceInformationFixture[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");

  return financeInformationItems.filter((item) => {
    if (channel !== "all" && item.channel !== channel) return false;
    if (normalizedQuery.length === 0) return true;

    return [item.title, ...item.relatedListingNames]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(normalizedQuery);
  });
}

export function getFinanceInformationById(
  id: string,
): FinanceInformationFixture | undefined {
  return financeInformationItems.find((item) => item.id === id);
}
