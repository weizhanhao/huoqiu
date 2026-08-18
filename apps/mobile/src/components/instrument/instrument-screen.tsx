import { plainPostText } from "@huoqiu/domain/social/post-body";
import { tokens } from "@huoqiu/native-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type {
  Announcement,
  ChartPeriod,
  ChartSeries,
  InstrumentLive,
  ResearchReport,
} from "../../api/market-api";
import type { SocialPost } from "../../api/social-api";
import { appTouchMinimum, touchSlop } from "../../styles/app-touch";
import { useSignColor } from "../../styles/market-colors";
import {
  MISSING,
  fixedOrMissing,
  signedAmount,
  signedPercent,
} from "../../styles/market-sign";
import { OrderBook, TapeList } from "./order-book";
import { PriceChart } from "./price-chart";

/*
 * 个股页。
 *
 * 参考图（instrument-*.png）里这一页是：报价头 + 八档周期 + 图 +
 * 讨论/资讯/公告/相关ETF 子页 + 底部动作条。
 *
 * 参考图里还有一档「成分股」——那张是道琼斯指数，成分股只有指数才有。个股上
 * 直接不显示这一档，而不是给一个点开永远是空的页签。
 */

export type InstrumentTab = "announcements" | "discussion" | "research";

const periods: readonly Readonly<{ id: ChartPeriod; label: string }>[] = [
  { id: "intraday", label: "分时" },
  { id: "5day", label: "五日" },
  { id: "day", label: "日K" },
  { id: "week", label: "周K" },
  { id: "month", label: "月K" },
  { id: "quarter", label: "季K" },
  { id: "year", label: "年K" },
  { id: "m60", label: "60分" },
  { id: "m15", label: "15分" },
];

/*
 * 「ETF」那一档换成了「研报」。
 *
 * 上一版把「相关ETF」改叫「ETF」，理由是服务端那条接口（/api/market/etfs）
 * 只认排序和翻页，根本没有「这只股票被哪些 ETF 持有」的概念。改了名，话是
 * 不假了，可每只股票点开列的仍然是同一份全市场 ETF——摆在个股页的一档里，
 * 位置本身就在暗示相关，得靠一句「这不是按相关度排的」去解释。
 *
 * 研报是真按代码查的（/api/market/research），一只票一份。用真数据占这一档，
 * 比用一句免责声明去救一份无关数据强。
 *
 * 资讯那一档早先去掉了：点开永远是一句「还没做」，而这个文件开头自己写着
 * 「不给一个点开永远是空的页签」。
 */
const tabs: readonly Readonly<{ id: InstrumentTab; label: string }>[] = [
  { id: "discussion", label: "讨论" },
  { id: "announcements", label: "公告" },
  { id: "research", label: "研报" },
];

export type InstrumentScreenProperties = Readonly<{
  announcements: readonly Announcement[] | null;
  announcementsFailure: string | null;
  chart: ChartSeries | null;
  chartFailure: string | null;
  chartLoading: boolean;
  discussions: readonly SocialPost[] | null;
  /** 这只标的的券商研报；null 表示还没取到。 */
  reports: readonly ResearchReport[] | null;
  reportsFailure: string | null;
  /*
   * 名称、涨跌与全部指标。
   *
   * 报价头上的数几乎都出自这里，不是 quote——quote 里只有撮合出来的那一组数
   * 和五档，没有名称、没有涨跌额、没有涨跌幅。
   */
  metrics: InstrumentLive["metrics"];
  onBack: () => void;
  onCompose: () => void;
  onOpenAnnouncement: (item: Announcement) => void;
  onOpenReport: (report: ResearchReport) => void;
  onOpenPost: (postId: string) => void;
  onSelectPeriod: (period: ChartPeriod) => void;
  onSelectTab: (tab: InstrumentTab) => void;
  onShowNotice: (title: string, detail: string) => void;
  onToggleWatchlist: () => void;
  period: ChartPeriod;
  /** 撮合出来的那一组数，外加五档盘口。 */
  quote: InstrumentLive["quote"];
  quoteFailure: string | null;
  symbol: string;
  tab: InstrumentTab;
  /** 逐笔成交明细。 */
  tape: InstrumentLive["tape"];
  watchlisted: boolean;
}>;

/* 一亿以上说「亿」，一万以上说「万」——原始位数在手机上读不出量级。 */
const money = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return MISSING;
  if (Math.abs(value) >= 1e8) return `${(value / 1e8).toFixed(2)} 亿`;
  if (Math.abs(value) >= 1e4) return `${(value / 1e4).toFixed(2)} 万`;
  return value.toFixed(2);
};

/* 成交量上游给的是股，A 股按手读。 */
const lots = (shares: number | null | undefined): string =>
  shares === null || shares === undefined ? MISSING : money(shares / 100);

const percent = (value: number | null | undefined): string =>
  value === null || value === undefined ? MISSING : `${value.toFixed(2)}%`;

/*
 * 一格指标：标签和数值挤在同一行。
 *
 * 此前是标签在上、数值在下，两行一格 —— 十二格就是四行，头部把图表挤到了
 * 屏幕很靠下的地方。雪球是八格两行，标签用单字缩写，整块只占两行的高度。
 */
const Metric = ({
  label,
  tone,
  value,
}: Readonly<{ label: string; tone?: string | undefined; value: string }>) => (
  <View style={styles.metric}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text
      numberOfLines={1}
      style={[styles.metricValue, tone === undefined ? null : { color: tone }]}
    >
      {value}
    </Text>
  </View>
);

export function InstrumentScreen({
  announcements,
  announcementsFailure,
  chart,
  chartFailure,
  chartLoading,
  discussions,
  reports,
  reportsFailure,
  metrics,
  onBack,
  onCompose,
  onOpenAnnouncement,
  onOpenReport,
  onOpenPost,
  onSelectPeriod,
  onSelectTab,
  onShowNotice,
  onToggleWatchlist,
  period,
  quote,
  quoteFailure,
  symbol,
  tab,
  tape,
  watchlisted,
}: InstrumentScreenProperties) {
  const insets = useSafeAreaInsets();
  const signColor = useSignColor();
  const color = signColor(metrics?.changePercent ?? 0);

  /*
   * 开高低收优先读 quote，缺了才回退到 metrics。
   *
   * 两处都有这四个数，但 quote 是撮合快照、metrics 是指标快照，取数时间可能差
   * 几秒。同屏的数出自同一份快照才对得上，所以定一个先后，而不是哪个非空用
   * 哪个。任一路超时时另一路顶上，总比空一格强。
   */
  const last = quote?.last ?? metrics?.last ?? null;
  const open = quote?.open ?? metrics?.open ?? null;
  const high = quote?.high ?? metrics?.high ?? null;
  const low = quote?.low ?? metrics?.low ?? null;
  /* 服务端在 quote 里叫 prevClose，在 metrics 里叫 previousClose。 */
  const previousClose =
    quote?.prevClose ?? metrics?.previousClose ?? tape?.previousClose ?? null;
  const empty = metrics === null && quote === null;

  /*
   * 高 / 低 / 开 相对昨收上色。
   *
   * 不是「高必红、低必绿」：全天下跌时最高价也可能低于昨收，那一格就该是绿的。
   * 昨收拿不到时保持中性——拿 null 去减会得到 NaN，而 NaN > 0 是 false，
   * 会被静悄悄地染成跌色。
   */
  const priceTone = (value: number | null): string | undefined =>
    value === null || previousClose === null
      ? undefined
      : signColor(value - previousClose);

  return (
    <View style={styles.screen} testID="instrument-screen">
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityLabel="返回"
          accessibilityRole="button"
          onPress={onBack}
          style={styles.topAction}
        >
          <Text style={styles.topGlyph}>‹</Text>
        </Pressable>
        <View style={styles.topTitle}>
          <Text numberOfLines={1} style={styles.name}>
            {metrics?.name ?? symbol}
          </Text>
          <Text style={styles.symbol}>{symbol.toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} style={styles.body}>
        {quoteFailure === null ? null : (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{quoteFailure}</Text>
          </View>
        )}

        <View style={styles.quoteBlock}>
          {/*
            价格与涨跌在**同一行**。此前涨跌另起一行，白占一整行高度，而这一
            行只有两个短数字。
          */}
          <View style={styles.priceRow}>
            <Text style={[styles.last, { color }]}>
              {fixedOrMissing(last, 2)}
            </Text>
            <Text style={[styles.change, { color }]}>
              {signedAmount(metrics?.changeAmount)}
            </Text>
            <Text style={[styles.change, { color }]}>
              {signedPercent(metrics?.changePercent)}
            </Text>
          </View>

          {/*
            八格两行，标签是单字缩写。

            此前是十二格、每格两行、标签写全（「今开」「成交量」「市盈TTM」），
            光这一块就四行。砍掉的四个都是能被别处推出来或读不准的：昨收 =
            现价 − 涨跌额（就在正上方），振幅 = (高−低)/昨收（高低就在同一列），
            量比开盘初期噪声极大且极易被读成「放量几倍」，市净只对重资产行业
            有解释力。

            列内成对：高低 / 开换 / 量额 / 估值——想看「今天成交怎么样」的人
            扫一列就够，不用在对角线上找两格。
          */}
          {empty ? null : (
            <>
              <View style={styles.metricRow}>
                <Metric
                  label="高"
                  tone={priceTone(high)}
                  value={fixedOrMissing(high, 2)}
                />
                <Metric
                  label="开"
                  tone={priceTone(open)}
                  value={fixedOrMissing(open, 2)}
                />
                <Metric label="量" value={lots(metrics?.volumeShares)} />
                <Metric label="额" value={money(metrics?.amount)} />
              </View>
              <View style={styles.metricRow}>
                <Metric
                  label="低"
                  tone={priceTone(low)}
                  value={fixedOrMissing(low, 2)}
                />
                <Metric label="换" value={percent(metrics?.turnoverPercent)} />
                <Metric label="总市值" value={money(metrics?.totalMarketCap)} />
                <Metric
                  label="市盈TTM"
                  value={fixedOrMissing(metrics?.peTtm, 2)}
                />
              </View>
            </>
          )}
        </View>

        <ScrollView
          contentContainerStyle={styles.periodStrip}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {periods.map(({ id, label }) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: id === period }}
              key={id}
              onPress={() => {
                onSelectPeriod(id);
              }}
              hitSlop={touchSlop(34)}
              style={styles.period}
            >
              <Text
                style={id === period ? styles.periodTextOn : styles.periodText}
              >
                {label}
              </Text>
              {/* 选中靠字重加一条下划线表达，不靠换颜色——蓝色在这一屏是链接色。 */}
              {id === period ? <View style={styles.periodMark} /> : null}
            </Pressable>
          ))}
        </ScrollView>

        <PriceChart
          failure={chartFailure}
          loading={chartLoading}
          previousClose={previousClose}
          series={chart}
        />

        <OrderBook asks={quote?.asks ?? null} bids={quote?.bids ?? null} />

        <TapeList previousClose={previousClose} ticks={tape?.ticks ?? null} />

        <View style={styles.tabStrip}>
          {tabs.map(({ id, label }) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: id === tab }}
              key={id}
              onPress={() => {
                onSelectTab(id);
              }}
              style={styles.tab}
            >
              <Text style={id === tab ? styles.tabTextOn : styles.tabText}>
                {label}
              </Text>
              {id === tab ? <View style={styles.tabUnderline} /> : null}
            </Pressable>
          ))}
        </View>

        {/*
          「还没取到」和「没人讨论过」是两件事。混成一句，网慢时每只票都
          看起来无人问津——而那是假的。
        */}
        {tab === "discussion" && discussions === null ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>正在读取讨论……</Text>
          </View>
        ) : null}

        {tab === "discussion" &&
        discussions !== null &&
        discussions.length === 0 ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              还没有人讨论这只标的。在帖子里写上它的代码，就会出现在这里。
            </Text>
          </View>
        ) : null}

        {tab === "discussion" && discussions !== null
          ? discussions.map((post) => (
              <Pressable
                accessibilityRole="button"
                key={post.id}
                onPress={() => {
                  onOpenPost(post.id);
                }}
                style={styles.row}
              >
                <Text style={styles.rowTitle}>{post.authorName}</Text>
                <Text numberOfLines={3} style={styles.rowBody}>
                  {plainPostText(post.body)}
                </Text>
              </Pressable>
            ))
          : null}

        {tab === "announcements" && announcementsFailure !== null ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{announcementsFailure}</Text>
          </View>
        ) : null}

        {tab === "announcements" &&
        announcementsFailure === null &&
        announcements === null ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>正在读取公告……</Text>
          </View>
        ) : null}

        {tab === "announcements" &&
        announcements !== null &&
        announcements.length === 0 ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>这只标的最近没有公告。</Text>
          </View>
        ) : null}

        {/*
          没有标题的那条不列。
          标题是这一行唯一的内容，缺了就是一行点得动、却不知道会打开什么的空白。
        */}
        {tab === "announcements" && announcements !== null
          ? announcements
              .filter((item) => item.title !== null)
              .slice(0, 20)
              .map((item) => (
                <Pressable
                  accessibilityRole="button"
                  key={item.href}
                  onPress={() => {
                    onOpenAnnouncement(item);
                  }}
                  style={styles.row}
                >
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowMeta}>
                    {[item.category, item.publishedOn]
                      .filter((part) => part !== null)
                      .join(" · ")}
                  </Text>
                </Pressable>
              ))
          : null}

        {tab === "research" && reportsFailure !== null ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{reportsFailure}</Text>
          </View>
        ) : null}

        {tab === "research" && reportsFailure === null && reports === null ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>正在读取研报……</Text>
          </View>
        ) : null}

        {tab === "research" && reports !== null && reports.length === 0 ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              最近半年没有券商发过这只标的的研报。
            </Text>
          </View>
        ) : null}

        {/*
          没有标题的那条不列——标题是这一行唯一读得懂的内容。
        */}
        {tab === "research" && reports !== null
          ? reports
              .filter((report) => report.title !== null)
              .slice(0, 20)
              .map((report) => (
                <Pressable
                  accessibilityRole="button"
                  key={report.href}
                  onPress={() => {
                    onOpenReport(report);
                  }}
                  style={styles.row}
                >
                  <Text style={styles.rowTitle}>{report.title}</Text>
                  <Text style={styles.rowMeta}>
                    {[report.institution, report.rating, report.publishedOn]
                      .filter((part) => part !== null)
                      .join(" · ")}
                  </Text>
                  {/*
                    目标价必须写清是谁给的。
                    只印一个「目标价 1680」，读起来像市场共识——而它是某一家
                    券商在某一天的看法，另一家可能给出完全不同的数。
                  */}
                  {report.targetPrice === null ? null : (
                    <Text style={styles.rowMeta}>
                      {report.institution ?? "该券商"}给出的目标价{" "}
                      {report.targetPrice.toFixed(2)}
                    </Text>
                  )}
                </Pressable>
              ))
          : null}

        <Text style={styles.disclosure}>
          行情来自公开接口 · 延时数据 · 不构成投资建议
        </Text>
      </ScrollView>

      {/* 底部横条会盖住这一排，所以要把安全区加进去。 */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.bottomQuote}>
          <Text style={[styles.bottomLast, { color }]}>
            {fixedOrMissing(last, 2)}
          </Text>
          <Text style={[styles.bottomPct, { color }]}>
            {signedPercent(metrics?.changePercent)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onCompose}
          style={styles.bottomAction}
        >
          <Text style={styles.bottomActionText}>发讨论</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onShowNotice("问AI", "对话式行情问答。这一块还没做。");
          }}
          style={styles.bottomAction}
        >
          <Text style={styles.bottomActionText}>问AI</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onToggleWatchlist}
          style={[styles.bottomAction, styles.bottomPrimary]}
        >
          <Text style={styles.bottomPrimaryText}>
            {watchlisted ? "已自选" : "加自选"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  bottomAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: appTouchMinimum,
    paddingHorizontal: 10,
  },
  bottomActionText: {
    color: tokens.text.secondary,
    fontSize: 13.5,
  },
  bottomBar: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderTopColor: tokens.border.default,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  bottomLast: {
    fontSize: 16,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  bottomPct: {
    fontSize: 11.5,
  },
  bottomPrimary: {
    backgroundColor: tokens.brand.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  bottomPrimaryText: {
    color: tokens.brand.onPrimary,
    fontSize: 13.5,
    fontWeight: "600",
  },
  bottomQuote: {
    flex: 1,
  },
  change: {
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  content: {
    paddingBottom: 24,
  },
  disclosure: {
    color: tokens.text.tertiary,
    fontSize: 12,
    paddingVertical: 14,
    textAlign: "center",
  },
  last: {
    fontSize: 32,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 38,
  },
  priceRow: {
    alignItems: "baseline",
    columnGap: 9,
    flexDirection: "row",
  },
  metric: {
    alignItems: "baseline",
    columnGap: 4,
    flexDirection: "row",
    /*
     * 四列宽度不等分。
     *
     * 等分的话「总市值 16164.68亿」会溢出，而「高 55.88」那一格白留一大片。
     * 按各列最宽的内容分配。
     */
    flexGrow: 1,
  },
  metricLabel: {
    color: tokens.text.tertiary,
    fontSize: 12,
    lineHeight: 18,
  },
  metricValue: {
    color: tokens.text.primary,
    flexShrink: 1,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    fontWeight: "500",
    lineHeight: 18,
  },
  metricRow: {
    flexDirection: "row",
    marginTop: 7,
  },
  name: {
    color: tokens.text.primary,
    fontSize: 17,
    fontWeight: "700",
  },
  notice: {
    backgroundColor: tokens.surface.subtle,
    borderRadius: 12,
    margin: 16,
    padding: 16,
  },
  noticeText: {
    color: tokens.text.secondary,
    fontSize: 14,
    lineHeight: 21,
  },
  period: {
    alignItems: "center",
    /*
     * 视觉高度 38，热区靠 hitSlop 撑到 48。
     *
     * 此前直接把视觉高度设成 48，周期条白白高出一截，而这一条只是七个短词。
     */
    height: 38,
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  periodMark: {
    backgroundColor: tokens.text.primary,
    borderRadius: 1,
    bottom: 4,
    height: 2,
    position: "absolute",
    width: 18,
  },
  periodStrip: {
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 12,
  },
  periodText: {
    color: tokens.text.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
  periodTextOn: {
    color: tokens.text.primary,
    /* 字号和未选中保持一致——差 0.5pt 会让相邻项在每次点击时左右抖一下。 */
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  quoteBlock: {
    backgroundColor: tokens.surface.base,
    paddingBottom: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  row: {
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowBody: {
    color: tokens.text.secondary,
    fontSize: 14,
    lineHeight: 22,
  },
  rowMeta: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
  },
  rowTitle: {
    color: tokens.text.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  screen: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  symbol: {
    color: tokens.text.tertiary,
    fontSize: 12,
  },
  tab: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: appTouchMinimum,
  },
  tabStrip: {
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    marginTop: 10,
  },
  tabText: {
    color: tokens.text.secondary,
    fontSize: 15,
  },
  tabTextOn: {
    color: tokens.text.primary,
    fontSize: 15.5,
    fontWeight: "700",
  },
  tabUnderline: {
    backgroundColor: tokens.brand.primary,
    borderRadius: 2,
    bottom: 2,
    height: 3,
    position: "absolute",
    width: 20,
  },
  topAction: {
    alignItems: "center",
    height: appTouchMinimum,
    justifyContent: "center",
    width: appTouchMinimum,
  },
  topGlyph: {
    color: tokens.text.primary,
    fontSize: 26,
  },
  topTitle: {
    alignItems: "center",
    flex: 1,
    gap: 1,
  },
  topbar: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingRight: appTouchMinimum + 8,
  },
});
