import type { D0Fixture } from "@huoqiu/contracts/d0";
import { tokens } from "@huoqiu/native-ui";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { d0TextColors } from "../../styles/d0-colors";
import { PageState } from "./page-state";
import { ScreenHeader } from "./screen-header";
import { WatchlistToggle } from "./watchlist-toggle";

type InstrumentDetailProperties = Readonly<{
  fixture: D0Fixture;
  listingId: string;
  state: "normal" | "loading" | "empty" | "error";
  onBack?: (() => void) | undefined;
  onRetry?: (() => void) | undefined;
}>;

const statusLabels = Object.freeze({
  open: "交易中",
  closed: "已收盘",
  halted: "已停牌",
});

export function InstrumentDetail({
  fixture,
  listingId,
  state,
  onBack,
  onRetry,
}: InstrumentDetailProperties) {
  const instrument = fixture.instruments.find(
    (candidate) => candidate.listing_id === listingId,
  );
  const quote = fixture.quotes.find(
    (candidate) => candidate.listing_id === listingId,
  );
  const series = fixture.bars.find(
    (candidate) => candidate.listing_id === listingId,
  );

  if (state !== "normal") {
    return (
      <View style={styles.viewport}>
        <ScreenHeader onBack={onBack} title="标的详情" />
        <View style={styles.stateWrap}>
          <PageState
            emptyMessage="暂无日 K 演示数据"
            errorMessage="日 K 演示数据校验失败"
            onRetry={onRetry}
            state={state}
          />
        </View>
      </View>
    );
  }

  if (instrument === undefined || quote === undefined) {
    return (
      <View style={styles.viewport}>
        <ScreenHeader onBack={onBack} title="标的详情" />
        <View style={styles.stateWrap}>
          <PageState state="empty" emptyMessage="没有这个演示标的" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.viewport}>
      <ScreenHeader
        onBack={onBack}
        subtitle={instrument.symbol}
        title={instrument.name}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.quoteCard}>
          <View style={styles.quoteTopline}>
            <View style={styles.quoteIdentity}>
              <Text style={styles.kicker}>SYNTHETIC INSTRUMENT</Text>
              <Text style={styles.symbol}>
                {instrument.symbol} · {instrument.market} ·{" "}
                {instrument.currency}
              </Text>
            </View>
            <WatchlistToggle listingId={listingId} />
          </View>
          <View style={styles.quotePrimary}>
            <Text style={styles.last}>{quote.last}</Text>
            <Text style={styles.change}>
              +{quote.change} · +{quote.change_pct}%
            </Text>
          </View>
          <View style={styles.metaGrid}>
            <Meta label="状态">
              {instrument.market} · {instrument.currency} ·{" "}
              {statusLabels[instrument.status]}
            </Meta>
            <Meta label="来源">{quote.source}</Meta>
            <Meta label="快照">{quote.as_of}</Meta>
            <Meta label="授权">{quote.entitlement}</Meta>
          </View>
        </View>

        {series === undefined || series.points.length === 0 ? (
          <PageState state="empty" emptyMessage="暂无日 K 演示数据" />
        ) : (
          <CandleChart
            instrumentName={instrument.name}
            points={series.points}
          />
        )}

        <View style={styles.disclosure}>
          <Text style={styles.disclosureTitle}>演示数据说明</Text>
          <Text style={styles.disclosureCopy}>
            本页只读取 huoqiu-synthetic
            固定快照，不连接真实行情，不提供投资建议或交易能力。
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Meta({
  children,
  label,
}: Readonly<{ children: ReactNode; label: string }>) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{children}</Text>
    </View>
  );
}

type BarPoint = D0Fixture["bars"][number]["points"][number];

function CandleChart({
  instrumentName,
  points,
}: Readonly<{ instrumentName: string; points: readonly BarPoint[] }>) {
  const lows = points.map((point) => Number(point.low));
  const highs = points.map((point) => Number(point.high));
  const minimum = Math.min(...lows);
  const maximum = Math.max(...highs);
  const range = Math.max(maximum - minimum, 0.01);
  const toY = (value: number) => ((maximum - value) / range) * 132;
  const maximumVolume = Math.max(
    ...points.map((point) => Number(point.volume)),
    1,
  );

  return (
    <View style={styles.chartCard}>
      <View style={styles.chartHeading}>
        <View>
          <Text style={styles.kicker}>20-DAY FIXTURE</Text>
          <Text style={styles.chartTitle}>日 K 走势</Text>
        </View>
        <Text style={styles.chartMeta}>只读 · 1d</Text>
      </View>
      <View
        accessibilityLabel={`${instrumentName} ${points.length} 个日 K 点，上涨红色，下跌绿色`}
        accessibilityRole="image"
        style={styles.chart}
      >
        {points.map((point, index) => {
          const openY = toY(Number(point.open));
          const closeY = toY(Number(point.close));
          const highY = toY(Number(point.high));
          const lowY = toY(Number(point.low));
          const isUp = Number(point.close) >= Number(point.open);
          return (
            <View
              key={point.at}
              style={styles.candleSlot}
              testID={`d0-candle-${index}`}
            >
              <View
                style={[
                  styles.wick,
                  isUp ? styles.up : styles.down,
                  {
                    height: Math.max(lowY - highY, 2),
                    top: highY,
                  },
                ]}
              />
              <View
                style={[
                  styles.body,
                  isUp ? styles.up : styles.down,
                  {
                    height: Math.max(Math.abs(closeY - openY), 3),
                    top: Math.min(openY, closeY),
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.chartFooter}>
        <Text style={styles.chartMeta}>{points[0]?.at.slice(0, 10)}</Text>
        <Text style={styles.chartMeta}>{points.length} 个日 K 点</Text>
        <Text style={styles.chartMeta}>{points.at(-1)?.at.slice(0, 10)}</Text>
      </View>
      <Text style={styles.volumeLabel}>成交量</Text>
      <View
        accessibilityLabel={`${instrumentName} ${points.length} 个成交量柱`}
        accessibilityRole="image"
        style={styles.volumeChart}
      >
        {points.map((point, index) => {
          const isUp = Number(point.close) >= Number(point.open);
          return (
            <View key={point.at} style={styles.volumeSlot}>
              <View
                style={[
                  styles.volumeBar,
                  isUp ? styles.up : styles.down,
                  {
                    height: Math.max(
                      (Number(point.volume) / maximumVolume) * 48,
                      2,
                    ),
                  },
                ]}
                testID={`d0-volume-${index}`}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  content: {
    gap: 14,
    padding: 16,
    paddingBottom: 32,
  },
  stateWrap: {
    flex: 1,
    padding: 16,
  },
  quoteCard: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 18,
    padding: 18,
  },
  quoteTopline: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  quoteIdentity: {
    flex: 1,
  },
  kicker: {
    color: tokens.text.tertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  symbol: {
    color: tokens.text.secondary,
    fontSize: 13,
    paddingTop: 7,
  },
  quotePrimary: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  last: {
    color: d0TextColors.marketUp,
    fontSize: 42,
    fontWeight: "700",
    letterSpacing: -2,
  },
  change: {
    color: d0TextColors.marketUp,
    fontSize: 14,
    fontWeight: "700",
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metaItem: {
    borderTopColor: tokens.surface.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    minWidth: "46%",
    paddingTop: 9,
  },
  metaLabel: {
    color: tokens.text.tertiary,
    fontSize: 10,
  },
  metaValue: {
    color: tokens.text.primary,
    fontSize: 12,
    lineHeight: 18,
    paddingTop: 3,
  },
  chartCard: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    padding: 18,
  },
  chartHeading: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 16,
  },
  chartTitle: {
    color: tokens.text.primary,
    fontSize: 21,
    fontWeight: "700",
    paddingTop: 6,
  },
  chartMeta: {
    color: tokens.text.tertiary,
    fontSize: 9,
  },
  chart: {
    borderBottomColor: tokens.surface.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.surface.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 2,
    height: 150,
    paddingHorizontal: 4,
    position: "relative",
  },
  candleSlot: {
    flex: 1,
    height: 136,
    position: "relative",
  },
  wick: {
    left: "47%",
    position: "absolute",
    width: 1,
  },
  body: {
    left: "20%",
    position: "absolute",
    width: "60%",
  },
  up: {
    backgroundColor: tokens.market.up,
  },
  down: {
    backgroundColor: tokens.market.down,
  },
  chartFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 10,
  },
  volumeLabel: {
    color: tokens.text.tertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    paddingTop: 18,
  },
  volumeChart: {
    alignItems: "flex-end",
    borderBottomColor: tokens.surface.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    height: 56,
    marginTop: 8,
  },
  volumeSlot: {
    alignItems: "center",
    flex: 1,
    height: 52,
    justifyContent: "flex-end",
  },
  volumeBar: {
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    opacity: 0.72,
    width: "62%",
  },
  disclosure: {
    backgroundColor: tokens.surface.base,
    borderLeftColor: tokens.market.warning,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 16,
  },
  disclosureTitle: {
    color: tokens.text.primary,
    fontSize: 14,
    fontWeight: "700",
    paddingBottom: 7,
  },
  disclosureCopy: {
    color: tokens.text.secondary,
    fontSize: 12,
    lineHeight: 20,
  },
});
