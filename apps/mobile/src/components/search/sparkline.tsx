import { tokens } from "@huoqiu/native-ui";
import { StyleSheet, View } from "react-native";

import { signColor } from "../../styles/market-sign";
import { boundsOf, ratio } from "../instrument/chart-bounds";

/*
 * 迷你走势图。
 *
 * 参考图（search-entry.png）里「热门股票」每行右侧都有一条当天的走势，红绿
 * 跟着涨跌走，底下有一条淡色的昨收基准线。
 *
 * 画法和个股页那张图同源（纯 View 拼），只是尺寸小、不画量能、不标坐标。
 * 点数多于像素时先抽稀：一个点占不到一像素的话，画出来是一片糊，还白白多出
 * 两百个视图。
 */

const WIDTH_POINTS = 28;

const thin = (values: readonly number[]): readonly number[] => {
  if (values.length <= WIDTH_POINTS) return values;
  const step = values.length / WIDTH_POINTS;
  return Array.from(
    { length: WIDTH_POINTS },
    (_, index) => values[Math.floor(index * step)] ?? 0,
  );
};

export type SparklineProperties = Readonly<{
  height?: number;
  /** 昨收。给了就画一条基准线，并按它定红绿。 */
  previousClose: number | null;
  prices: readonly number[];
  width?: number;
}>;

export function Sparkline({
  height = 34,
  previousClose,
  prices,
  width = 74,
}: SparklineProperties) {
  const points = thin(prices);
  if (points.length < 2) {
    /*
     * 一个点画不出走势。留一块等高的空白，而不是画一条平线——平线看起来
     * 像「今天没动」，而事实是没取到。
     */
    return <View style={{ height, width }} testID="sparkline-blank" />;
  }

  const base = previousClose ?? points[0] ?? 0;
  const bounds = boundsOf([...points, base]);
  const last = points[points.length - 1] ?? base;
  const color = signColor(last - base);
  const step = width / (points.length - 1);

  return (
    <View style={[styles.canvas, { height, width }]} testID="sparkline">
      <View
        style={[
          styles.baseline,
          { bottom: ratio(bounds, base) * height, width },
        ]}
      />
      {points.map((price, index) => (
        <View
          key={`${String(index)}-${String(price)}`}
          style={[
            styles.dot,
            {
              backgroundColor: color,
              bottom: ratio(bounds, price) * height - 1,
              left: index * step,
              width: Math.max(step, 1.5),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  baseline: {
    backgroundColor: tokens.border.strong,
    height: 1,
    left: 0,
    opacity: 0.7,
    position: "absolute",
  },
  canvas: {
    position: "relative",
  },
  dot: {
    borderRadius: 1,
    height: 2,
    position: "absolute",
  },
});
