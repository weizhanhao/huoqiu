import { tokens } from "@huoqiu/native-ui";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type {
  Announcement,
  ChartPeriod,
  ChartSeries,
  HotRow,
  InstrumentQuote,
} from "../../api/market-api";
import type { SocialPost } from "../../api/social-api";
import { appTouchMinimum } from "../../styles/app-touch";
import { useSignColor } from "../../styles/market-colors";
import { signedAmount, signedPercent } from "../../styles/market-sign";
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

export type InstrumentTab = "announcements" | "discussion" | "etfs";

const periods: readonly Readonly<{ id: ChartPeriod; label: string }>[] = [
  { id: "intraday", label: "分时" },
  { id: "5day", label: "五日" },
  { id: "day", label: "日K" },
  { id: "week", label: "周K" },
  { id: "month", label: "月K" },
  { id: "year", label: "年K" },
  { id: "m60", label: "60分" },
  { id: "m15", label: "15分" },
];

/*
 * 「相关ETF」改叫「ETF」。
 *
 * 服务端那条接口（/api/market/etfs）只认排序和翻页，根本没有「这只股票被
 * 哪些 ETF 持有」的概念——它回的是全市场按成交额排的 ETF。挂着「相关」两个
 * 字，等于把无关数据说成相关：读的人会以为这几只跟手上这只票有关系，
 * 然后据此做判断。而它不会报错，每一行看起来都正常。
 *
 * 资讯那一档也去掉了：点开永远是一句「还没做」，而这个文件开头自己写着
 * 「不给一个点开永远是空的页签」。
 */
const tabs: readonly Readonly<{ id: InstrumentTab; label: string }>[] = [
  { id: "discussion", label: "讨论" },
  { id: "announcements", label: "公告" },
  { id: "etfs", label: "ETF" },
];

export type InstrumentScreenProperties = Readonly<{
  announcements: readonly Announcement[] | null;
  announcementsFailure: string | null;
  chart: ChartSeries | null;
  chartFailure: string | null;
  chartLoading: boolean;
  discussions: readonly SocialPost[] | null;
  etfs: readonly HotRow[] | null;
  etfsFailure: string | null;
  onBack: () => void;
  onCompose: () => void;
  onOpenAnnouncement: (item: Announcement) => void;
  onOpenEtf: (href: string) => void;
  onOpenPost: (postId: string) => void;
  onSelectPeriod: (period: ChartPeriod) => void;
  onSelectTab: (tab: InstrumentTab) => void;
  onShowNotice: (title: string, detail: string) => void;
  onToggleWatchlist: () => void;
  period: ChartPeriod;
  quote: InstrumentQuote | null;
  quoteFailure: string | null;
  symbol: string;
  tab: InstrumentTab;
  watchlisted: boolean;
}>;

const Metric = ({
  label,
  value,
}: Readonly<{ label: string; value: string }>) => (
  <View style={styles.metric}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
);

export function InstrumentScreen({
  announcements,
  announcementsFailure,
  chart,
  chartFailure,
  chartLoading,
  discussions,
  etfs,
  etfsFailure,
  onBack,
  onCompose,
  onOpenAnnouncement,
  onOpenEtf,
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
  watchlisted,
}: InstrumentScreenProperties) {
  const signColor = useSignColor();
  const color = signColor(quote?.changePercent ?? 0);

  return (
    <View style={styles.screen} testID="instrument-screen">
      <View style={styles.topbar}>
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
            {quote?.name ?? symbol}
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
          <Text style={[styles.last, { color }]}>
            {quote === null ? "—" : quote.last.toFixed(2)}
          </Text>
          <Text style={[styles.change, { color }]}>
            {quote === null
              ? "—"
              : `${signedAmount(quote.changeAmount)}  ${signedPercent(quote.changePercent)}`}
          </Text>
          {quote === null ? null : (
            <View style={styles.metrics}>
              <Metric label="今开" value={quote.open.toFixed(2)} />
              <Metric label="最高" value={quote.high.toFixed(2)} />
              <Metric label="最低" value={quote.low.toFixed(2)} />
              <Metric label="昨收" value={quote.previousClose.toFixed(2)} />
            </View>
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
              style={styles.period}
            >
              <Text
                style={id === period ? styles.periodTextOn : styles.periodText}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <PriceChart
          failure={chartFailure}
          loading={chartLoading}
          previousClose={quote?.previousClose ?? null}
          series={chart}
        />

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
                  {post.body}
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

        {tab === "announcements" && announcements !== null
          ? announcements.slice(0, 20).map((item) => (
              <Pressable
                accessibilityRole="button"
                key={item.href}
                onPress={() => {
                  onOpenAnnouncement(item);
                }}
                style={styles.row}
              >
                <Text style={styles.rowTitle}>{item.title ?? item.name}</Text>
                <Text style={styles.rowMeta}>
                  {item.name} · {item.publishedOn}
                </Text>
              </Pressable>
            ))
          : null}

        {tab === "etfs" ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              我们还没有「这只票被哪些 ETF 持有」的数据。下面是按成交额排的
              全市场 ETF，不是按相关度排的。
            </Text>
          </View>
        ) : null}

        {tab === "etfs" && etfsFailure !== null ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{etfsFailure}</Text>
          </View>
        ) : null}

        {tab === "etfs" && etfsFailure === null && etfs === null ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>正在读取 ETF……</Text>
          </View>
        ) : null}

        {tab === "etfs" && etfs !== null
          ? etfs.slice(0, 20).map((row) => (
              <Pressable
                accessibilityRole="button"
                key={row.code}
                disabled={row.href === null}
                onPress={() => {
                  if (row.href !== null) onOpenEtf(row.href);
                }}
                style={styles.etfRow}
              >
                <View style={styles.etfMain}>
                  <Text style={styles.rowTitle}>{row.name}</Text>
                  <Text style={styles.rowMeta}>{row.code}</Text>
                </View>
                <Text
                  style={[
                    styles.etfPct,
                    { color: signColor(row.changePercent) },
                  ]}
                >
                  {signedPercent(row.changePercent)}
                </Text>
              </Pressable>
            ))
          : null}

        <Text style={styles.disclosure}>
          行情来自公开接口 · 延时数据 · 不构成投资建议
        </Text>
      </ScrollView>

      <View style={styles.bottomBar}>
        <View style={styles.bottomQuote}>
          <Text style={[styles.bottomLast, { color }]}>
            {quote === null ? "—" : quote.last.toFixed(2)}
          </Text>
          <Text style={[styles.bottomPct, { color }]}>
            {quote === null ? "" : signedPercent(quote.changePercent)}
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
    paddingBottom: 20,
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
  etfMain: {
    flex: 1,
    gap: 2,
  },
  etfPct: {
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  etfRow: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  last: {
    fontSize: 32,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  metric: {
    flexBasis: "24%",
    flexGrow: 1,
    gap: 2,
  },
  metricLabel: {
    color: tokens.text.tertiary,
    fontSize: 11.5,
  },
  metricValue: {
    color: tokens.text.primary,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
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
    justifyContent: "center",
    minHeight: 40,
  },
  periodStrip: {
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 14,
  },
  periodText: {
    color: tokens.text.secondary,
    fontSize: 14,
  },
  periodTextOn: {
    color: tokens.brand.primary,
    fontSize: 14.5,
    fontWeight: "700",
  },
  quoteBlock: {
    backgroundColor: tokens.surface.base,
    gap: 2,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
