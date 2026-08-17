import { tokens } from "@huoqiu/native-ui";
import { StyleSheet, Text, View } from "react-native";

import type { ChartSeries } from "../../api/market-api";
import { useSignColor } from "../../styles/market-colors";
import { signedPercent } from "../../styles/market-sign";
import { boundsOf, ratio } from "./chart-bounds";

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
 * 明确不做的：十字光标、缩放、技术指标。做半套「看着能拖却拖不动」的交互，
 * 比老实给一张静态图更糟。
 */

const CHART_HEIGHT = 168;
const VOLUME_HEIGHT = 44;

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

  return (
    <View>
      <View style={styles.canvas}>
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
        <Text style={styles.axisText}>{shown[0]?.date ?? ""}</Text>
        <Text style={styles.axisText}>
          {shown.length} 根 ·{" "}
          {signedPercent(
            ((shown[shown.length - 1]?.close ?? 0) / (shown[0]?.open ?? 1) - 1) *
              100,
          )}
        </Text>
        <Text style={styles.axisText}>
          {shown[shown.length - 1]?.date ?? ""}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
