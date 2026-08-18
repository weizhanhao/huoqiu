import { tokens } from "@huoqiu/native-ui";
import { useCallback, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";

import type { ChartBar, ChartSeries } from "../../api/market-api";
import { useSignColor } from "../../styles/market-colors";
import { signedPercent } from "../../styles/market-sign";
import { barIndexAt, boundsOf, ratio } from "./chart-bounds";

/*
 * 分时与 K 线。
 *
 * 用纯 View 画，不引图表库：RN 的图表库几乎都带原生模块，一装进来这个工程就
 * 再也不能用 Expo Go 打开，而用户现在正是靠 Expo Go 预览的。
 *
 * 画法：把每根柱按价格区间映射到高度，绝对定位摆开。K 线画实体（开收之间）
 * 加影线（高低之间），分时画一条由细段拼出的折线。分辨率不如原生图表，
 * 但形状、方向、量能都是真的。
 *
 * 十字光标是有的：按住图往左右拖，读数跟着手指走。用 RN 自带的 responder
 * 事件做，不引手势库——那些库都带原生模块，装进来这个工程就打不开 Expo Go。
 *
 * 明确不做的：缩放、技术指标。做半套「看着能捏却捏不动」的交互，比老实给一张
 * 画得对的图更糟。
 */

const CHART_HEIGHT = 168;
const VOLUME_HEIGHT = 44;

/*
 * 坐标轴两端那两个刻度。
 *
 * 各周期的 date 形状不一样：日/周/月是 2026-08-17，年是 2026，而分钟级
 * （60分、15分…）上游给的是 202604221030 这样一串十二位数——原样印出来，
 * 图底下就是两串谁也读不出的数字。它不报错，图也画得对，只是那两个刻度废了。
 */
const axisLabel = (date: string | undefined): string => {
  if (date === undefined) return "";
  if (/^\d{12}$/u.test(date)) {
    /* YYYYMMDDHHmm → MM-DD HH:mm。年份在分钟图上没有信息量，省掉。 */
    return `${date.slice(4, 6)}-${date.slice(6, 8)} ${date.slice(8, 10)}:${date.slice(10, 12)}`;
  }
  return date;
};

/*
 * 手指底下那根柱子的读数。
 *
 * 一张 K 线图最常被问的问题是「这根是哪天、多少钱」。没有读数的话，用户只能
 * 靠图形猜——而柱子只有两三个像素宽，猜不出来。
 *
 * 「live」用来区分「你正按着的这根」和「默认显示的最新一根」：不区分的话，
 * 松开手之后那一行数字还在，看起来像光标卡住了。
 */
const Readout = ({
  bar,
  live,
}: Readonly<{ bar: ChartBar | undefined; live: boolean }>) => {
  const signColor = useSignColor();
  if (bar === undefined) return null;
  const change = bar.close - bar.open;
  const percent = bar.open === 0 ? null : (change / bar.open) * 100;
  return (
    <View style={styles.readout}>
      <Text style={styles.readoutDate}>
        {live ? axisLabel(bar.date) : `最新 ${axisLabel(bar.date)}`}
      </Text>
      <Text style={styles.readoutCell}>开 {bar.open.toFixed(2)}</Text>
      <Text style={styles.readoutCell}>高 {bar.high.toFixed(2)}</Text>
      <Text style={styles.readoutCell}>低 {bar.low.toFixed(2)}</Text>
      <Text style={[styles.readoutCell, { color: signColor(change) }]}>
        收 {bar.close.toFixed(2)} {signedPercent(percent)}
      </Text>
    </View>
  );
};

export type PriceChartProperties = Readonly<{
  failure: string | null;
  loading: boolean;
  previousClose: number | null;
  series: ChartSeries | null;
}>;

export function PriceChart({
  failure,
  loading,
  previousClose,
  series,
}: PriceChartProperties) {
  const signColor = useSignColor();

  /*
   * 十字光标的状态。
   *
   * 宽度得自己量：柱子的位置是按百分比排的，而手指给的是像素。没量到之前
   * （width 为 0）barIndexAt 一律回 0，不会算出 NaN。
   */
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const measure = useCallback((event: LayoutChangeEvent) => {
    setCanvasWidth(event.nativeEvent.layout.width);
  }, []);

  const clear = useCallback(() => {
    setActiveIndex(null);
  }, []);

  if (failure !== null) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>{failure}</Text>
      </View>
    );
  }
  if (series === null) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          {loading ? "正在读取图形……" : "还没有取到图形。"}
        </Text>
      </View>
    );
  }

  if (series.kind === "line") {
    const { points } = series;
    if (points.length === 0) {
      return (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>这一段没有成交。</Text>
        </View>
      );
    }

    const prices = points.map((point) => point.price);
    /*
     * 分时的纵轴要把昨收包进来。
     *
     * 不包的话，全天都在昨收之下时那条基准线会跑到图外，看图的人失去唯一的
     * 参照——涨还是跌，只能靠读数字。
     */
    const bounds = boundsOf(
      previousClose === null ? prices : [...prices, previousClose],
    );
    const volumeTop = Math.max(...points.map((point) => point.volumeShares), 1);
    const width = 100 / points.length;

    return (
      <View>
        <View style={styles.canvas}>
          {previousClose === null ? null : (
            <View
              style={[
                styles.baseline,
                { bottom: ratio(bounds, previousClose) * CHART_HEIGHT },
              ]}
            />
          )}
          {points.map((point, index) => (
            <View
              key={`${point.time}-${String(index)}`}
              style={[
                styles.linePoint,
                {
                  backgroundColor:
                    previousClose === null
                      ? tokens.brand.primary
                      : signColor(point.price - previousClose),
                  bottom: ratio(bounds, point.price) * CHART_HEIGHT - 1,
                  left: `${index * width}%`,
                  width: `${Math.max(width, 0.6)}%`,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.volumeCanvas}>
          {points.map((point, index) => (
            <View
              key={`v-${point.time}-${String(index)}`}
              style={[
                styles.volumeBar,
                {
                  height: Math.max(
                    (point.volumeShares / volumeTop) * VOLUME_HEIGHT,
                    1,
                  ),
                  left: `${index * width}%`,
                  width: `${Math.max(width - 0.1, 0.5)}%`,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.axis}>
          <Text style={styles.axisText}>{points[0]?.time ?? ""}</Text>
          <Text style={styles.axisText}>
            {points[points.length - 1]?.time ?? ""}
          </Text>
        </View>
      </View>
    );
  }

  const { bars } = series;
  if (bars.length === 0) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>这一段没有数据。</Text>
      </View>
    );
  }

  /* 只画最后 120 根：再多，每根不到一像素，画出来是一片糊。 */
  const shown = bars.slice(-120);
  const bounds = boundsOf([
    ...shown.map((bar) => bar.high),
    ...shown.map((bar) => bar.low),
  ]);
  const volumeTop = Math.max(...shown.map((bar) => bar.volumeShares), 1);
  const width = 100 / shown.length;
  const active = activeIndex === null ? null : shown[activeIndex];

  /* 柱子数量到这里才知道，所以这个处理器不能是 hook——就地闭包即可。 */
  const track = (event: GestureResponderEvent): void => {
    setActiveIndex(
      barIndexAt(event.nativeEvent.locationX, canvasWidth, shown.length),
    );
  };

  return (
    <View>
      {/*
        读数条占一个固定的位置，不是按住才出现。
        按住才长出来的话，整张图会往下跳一行，手指底下的那根柱子就不再是刚才
        瞄准的那根了。没按住时显示最后一根——也就是最新的那根。
      */}
      <Readout bar={active ?? shown[shown.length - 1]} live={active !== null} />
      <View
        onLayout={measure}
        onResponderMove={track}
        onResponderRelease={clear}
        onResponderTerminate={clear}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={track}
        style={styles.canvas}
        testID="price-chart-canvas"
      >
        {activeIndex === null ? null : (
          <View
            pointerEvents="none"
            style={[
              styles.crosshair,
              { left: `${(activeIndex + 0.5) * width}%` },
            ]}
          />
        )}
        {shown.map((bar, index) => {
          const top = ratio(bounds, Math.max(bar.open, bar.close));
          const bottom = ratio(bounds, Math.min(bar.open, bar.close));
          const color = signColor(bar.close - bar.open);
          return (
            <View key={bar.date}>
              <View
                style={[
                  styles.wick,
                  {
                    backgroundColor: color,
                    bottom: ratio(bounds, bar.low) * CHART_HEIGHT,
                    height: Math.max(
                      (ratio(bounds, bar.high) - ratio(bounds, bar.low)) *
                        CHART_HEIGHT,
                      1,
                    ),
                    left: `${index * width + width / 2}%`,
                  },
                ]}
              />
              {/* 实体给 1px 下限：平盘那天否则会整根消失。 */}
              <View
                style={[
                  styles.body,
                  {
                    backgroundColor: color,
                    bottom: bottom * CHART_HEIGHT,
                    height: Math.max((top - bottom) * CHART_HEIGHT, 1),
                    left: `${index * width}%`,
                    width: `${Math.max(width - 0.2, 0.6)}%`,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.volumeCanvas}>
        {shown.map((bar, index) => (
          <View
            key={`v-${bar.date}`}
            style={[
              styles.volumeBar,
              {
                backgroundColor: signColor(bar.close - bar.open),
                height: Math.max(
                  (bar.volumeShares / volumeTop) * VOLUME_HEIGHT,
                  1,
                ),
                left: `${index * width}%`,
                width: `${Math.max(width - 0.2, 0.5)}%`,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisText}>{axisLabel(shown[0]?.date)}</Text>
        <Text style={styles.axisText}>
          {shown.length} 根 ·{" "}
          {signedPercent(
            ((shown[shown.length - 1]?.close ?? 0) / (shown[0]?.open ?? 1) -
              1) *
              100,
          )}
        </Text>
        <Text style={styles.axisText}>
          {axisLabel(shown[shown.length - 1]?.date)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* 十字线只画竖的一条：横的那条要跟着价格走，在这个精度下反而误导。 */
  crosshair: {
    backgroundColor: tokens.text.tertiary,
    bottom: 0,
    position: "absolute",
    top: 0,
    width: 1,
  },
  readout: {
    alignItems: "center",
    columnGap: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingVertical: 6,
    rowGap: 2,
  },
  readoutCell: {
    color: tokens.text.secondary,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  readoutDate: {
    color: tokens.text.primary,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  axis: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  axisText: {
    color: tokens.text.tertiary,
    fontSize: 11,
  },
  baseline: {
    backgroundColor: tokens.border.default,
    height: 1,
    left: 0,
    position: "absolute",
    right: 0,
  },
  body: {
    position: "absolute",
  },
  canvas: {
    backgroundColor: tokens.surface.base,
    height: CHART_HEIGHT,
    marginHorizontal: 12,
    position: "relative",
  },
  linePoint: {
    borderRadius: 1,
    height: 2,
    position: "absolute",
  },
  placeholder: {
    alignItems: "center",
    height: CHART_HEIGHT,
    justifyContent: "center",
  },
  placeholderText: {
    color: tokens.text.secondary,
    fontSize: 14,
  },
  volumeBar: {
    backgroundColor: tokens.brand.secondary,
    bottom: 0,
    position: "absolute",
  },
  volumeCanvas: {
    height: VOLUME_HEIGHT,
    marginHorizontal: 12,
    marginTop: 6,
    position: "relative",
  },
  wick: {
    position: "absolute",
    width: 1,
  },
});
