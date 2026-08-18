import { tokens } from "@huoqiu/native-ui";
import { useCallback, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";

import type { ChartBar, ChartPoint, ChartSeries } from "../../api/market-api";
import { useSignColor } from "../../styles/market-colors";
import { fixedOrMissing, signedPercent } from "../../styles/market-sign";
import type { Bounds } from "./chart-bounds";
import { barIndexAt, boundsOf, movingAverage, ratio } from "./chart-bounds";

/*
 * 分时与 K 线。
 *
 * 版式照雪球：读数条在最上面（按住时跟着手指走），中间价格区，下面量能区，
 * 最底一行时间轴。价格区右侧标出这一屏的最高最低；分时另外标出昨收那条线
 * ——看分时的人真正在读的是「离昨收多远」。
 *
 * 用纯 View 画，不引图表库：RN 的图表库几乎都带原生模块，一装进来这个工程就
 * 再也不能用 Expo Go 打开，而用户现在正是靠 Expo Go 预览的。
 *
 * 折线是「每一列从上一个点的高度连到这个点的高度」拼出来的，不是一串孤立的
 * 点。此前每个点画一个 2px 方块，屏幕上就是一片断续的绿点——形状勉强看得
 * 出来，但那不是一条线。
 *
 * 明确不做的：缩放、画线工具。做半套「看着能捏却捏不动」的交互，比老实给一张
 * 画得对的图更糟。
 */

const CHART_HEIGHT = 168;
const VOLUME_HEIGHT = 44;

/* 只画最后这么多根：再多，每根不到一像素，画出来是一片糊。 */
const VISIBLE_BARS = 120;

/*
 * 均线颜色。
 *
 * 这三条是线不是文字，不受正文对比度那套约束，但彼此必须一眼分得开——三条
 * 挤在一起、颜色又相近的话，图上等于只有一条粗线。取橙、蓝、紫：色相各差
 * 一百度以上，转成灰度后明度也不同，色觉障碍下仍然分得开。
 */
const MA_LINES = [
  { color: "#D98324", label: "MA5", window: 5 },
  { color: "#2F6FD0", label: "MA10", window: 10 },
  { color: "#8B5CB8", label: "MA20", window: 20 },
] as const;

/** 分时的均价线。和均线同一套理由，取一个和价格线拉得开的暖色。 */
const AVERAGE_LINE = "#D98324";

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
 * 让纵轴以昨收为中心对称。
 *
 * 不对称的话，涨 1% 和跌 1% 在图上的距离不一样，一个平淡的日子会被画成单边
 * 行情。全天贴着昨收不动时（货币 ETF 就是这样）给一个最小幅度，否则整张图
 * 会被放大到只剩噪声。
 */
const symmetricAround = (center: number, values: readonly number[]): Bounds => {
  const reach = Math.max(
    ...values.map((value) => Math.abs(value - center)),
    Math.abs(center) * 0.001,
  );
  return { high: center + reach, low: center - reach };
};

/*
 * 一条折线。
 *
 * 每一列画一段，从上一个点的高度连到这个点的高度——相邻两点之间因此是连着
 * 的。单画点的话，价格一跳，屏幕上就是两颗离得很远的孤点，中间什么都没有。
 *
 * 窗口不满的均线值是 null，跳过不画：补 0 会让线从图底拔地而起。
 */
const Polyline = ({
  bounds,
  color,
  name,
  thickness = 1.5,
  values,
}: Readonly<{
  bounds: Bounds;
  color: string;
  /** 只用来做 key 前缀，几条线同时画时不至于撞。 */
  name: string;
  thickness?: number;
  values: readonly (number | null)[];
}>) => {
  const step = 100 / Math.max(values.length, 1);
  return (
    <>
      {values.map((value, index) => {
        if (value === null) return null;
        const previous = index === 0 ? value : (values[index - 1] ?? value);
        const from = ratio(bounds, previous);
        const to = ratio(bounds, value);
        const low = Math.min(from, to);
        const high = Math.max(from, to);
        return (
          <View
            key={`${name}-${String(index)}`}
            pointerEvents="none"
            style={{
              backgroundColor: color,
              bottom: low * CHART_HEIGHT,
              height: Math.max((high - low) * CHART_HEIGHT, thickness),
              left: `${index * step}%`,
              position: "absolute",
              width: `${Math.max(step, 0.8)}%`,
            }}
          />
        );
      })}
    </>
  );
};

/** 价格区右侧的刻度。绝对定位压在图上，不参与布局。 */
const AxisTick = ({
  align,
  text,
}: Readonly<{ align: "bottom" | "middle" | "top"; text: string }>) => (
  <Text
    pointerEvents="none"
    style={[
      styles.tick,
      align === "top" ? styles.tickTop : null,
      align === "middle" ? styles.tickMiddle : null,
      align === "bottom" ? styles.tickBottom : null,
    ]}
  >
    {text}
  </Text>
);

/** 十字光标：一竖一横，横的那条落在手指所指的那个价上。 */
const Crosshair = ({
  left,
  value,
}: Readonly<{ left: `${number}%`; value: number | null }>) => (
  <>
    <View pointerEvents="none" style={[styles.crosshair, { left }]} />
    {value === null ? null : (
      <View
        pointerEvents="none"
        style={[styles.crosshairLevel, { bottom: value }]}
      />
    )}
  </>
);

/*
 * 手指底下那根柱子的读数。
 *
 * 一张 K 线图最常被问的问题是「这根是哪天、多少钱」。没有读数的话，用户只能
 * 靠图形猜——而柱子只有两三个像素宽，猜不出来。
 *
 * 「live」用来区分「你正按着的这根」和「默认显示的最新一根」：不区分的话，
 * 松开手之后那一行数字还在，看起来像光标卡住了。
 */
const CandleReadout = ({
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

/** 分时的读数：时间、价、均价，以及离昨收多远。 */
const IntradayReadout = ({
  live,
  point,
  previousClose,
}: Readonly<{
  live: boolean;
  point: ChartPoint | undefined;
  previousClose: number | null;
}>) => {
  const signColor = useSignColor();
  if (point === undefined) return null;
  const change = previousClose === null ? null : point.price - previousClose;
  const percent =
    previousClose === null || previousClose === 0
      ? null
      : ((point.price - previousClose) / previousClose) * 100;
  return (
    <View style={styles.readout}>
      <Text style={styles.readoutDate}>
        {live ? point.time : `最新 ${point.time}`}
      </Text>
      <Text style={[styles.readoutCell, { color: signColor(change) }]}>
        价 {point.price.toFixed(2)} {signedPercent(percent)}
      </Text>
      <Text style={[styles.readoutCell, { color: AVERAGE_LINE }]}>
        均价 {point.averagePrice.toFixed(2)}
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

  /* 有几列要到渲染分支才知道，所以由分支把数量绑进来。 */
  const trackWith =
    (count: number) =>
    (event: GestureResponderEvent): void => {
      setActiveIndex(
        barIndexAt(event.nativeEvent.locationX, canvasWidth, count),
      );
    };

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

  /* ---------------------------------------------------------- 分时 / 五日 */

  if (series.kind === "line") {
    const { points } = series;
    if (points.length === 0) {
      return (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>这一段没有成交。</Text>
        </View>
      );
    }

    const prices = points.map((entry) => entry.price);
    /*
     * 纵轴要把昨收包进来。
     *
     * 不包的话，全天都在昨收之下时那条基准线会跑到图外，看图的人失去唯一的
     * 参照——涨还是跌，只能靠读数字。
     */
    const bounds =
      previousClose === null
        ? boundsOf(prices)
        : symmetricAround(previousClose, prices);
    const volumeTop = Math.max(...points.map((entry) => entry.volumeShares), 1);
    const step = 100 / points.length;
    const active = activeIndex === null ? null : points[activeIndex];
    const shownPoint = active ?? points[points.length - 1];
    const track = trackWith(points.length);

    return (
      <View>
        <IntradayReadout
          live={active !== null}
          point={shownPoint}
          previousClose={previousClose}
        />
        <View
          onLayout={measure}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={track}
          onResponderMove={track}
          onResponderRelease={clear}
          onResponderTerminate={clear}
          onStartShouldSetResponder={() => true}
          style={styles.canvas}
          testID="price-chart-canvas"
        >
          {previousClose === null ? null : (
            <View
              pointerEvents="none"
              style={[
                styles.baseline,
                { bottom: ratio(bounds, previousClose) * CHART_HEIGHT },
              ]}
            />
          )}
          <Polyline
            bounds={bounds}
            color={AVERAGE_LINE}
            name="avg"
            values={points.map((entry) => entry.averagePrice)}
          />
          <Polyline
            bounds={bounds}
            color={tokens.brand.primary}
            name="price"
            thickness={2}
            values={prices}
          />
          {activeIndex === null ? null : (
            <Crosshair
              left={`${(activeIndex + 0.5) * step}%`}
              value={
                shownPoint === undefined
                  ? null
                  : ratio(bounds, shownPoint.price) * CHART_HEIGHT
              }
            />
          )}
          <AxisTick align="top" text={bounds.high.toFixed(2)} />
          {previousClose === null ? null : (
            <AxisTick align="middle" text={previousClose.toFixed(2)} />
          )}
          <AxisTick align="bottom" text={bounds.low.toFixed(2)} />
        </View>

        <View style={styles.volumeCanvas}>
          {points.map((entry, index) => {
            const before = points[index - 1]?.price ?? entry.price;
            return (
              <View
                key={`v-${entry.time}-${String(index)}`}
                style={[
                  styles.volumeBar,
                  {
                    backgroundColor: signColor(entry.price - before),
                    height: Math.max(
                      (entry.volumeShares / volumeTop) * VOLUME_HEIGHT,
                      1,
                    ),
                    left: `${index * step}%`,
                    width: `${Math.max(step - 0.1, 0.5)}%`,
                  },
                ]}
              />
            );
          })}
        </View>

        <View style={styles.axis}>
          <Text style={styles.axisText}>{points[0]?.time ?? ""}</Text>
          <Text style={styles.axisText}>按住看每一分钟</Text>
          <Text style={styles.axisText}>
            {points[points.length - 1]?.time ?? ""}
          </Text>
        </View>
      </View>
    );
  }

  /* ---------------------------------------------------------------- K 线 */

  const { bars } = series;
  if (bars.length === 0) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>这一段没有数据。</Text>
      </View>
    );
  }

  /*
   * 均线在全量上算，再截显示的这一段。
   *
   * 只拿屏幕上这 120 根算的话，第一根的 MA20 永远是空的——而它明明有历史
   * 可用，图上会白白缺掉一截。
   */
  const closes = bars.map((entry) => entry.close);
  const averages = MA_LINES.map((line) => ({
    ...line,
    values: movingAverage(closes, line.window).slice(-VISIBLE_BARS),
  }));

  const shown = bars.slice(-VISIBLE_BARS);
  const bounds = boundsOf([
    ...shown.map((entry) => entry.high),
    ...shown.map((entry) => entry.low),
    /* 均线也要进纵轴，否则它会画到框外去。 */
    ...averages.flatMap((line) =>
      line.values.filter((value): value is number => value !== null),
    ),
  ]);
  const volumeTop = Math.max(...shown.map((entry) => entry.volumeShares), 1);
  const step = 100 / shown.length;
  const active = activeIndex === null ? null : shown[activeIndex];
  const shownBar = active ?? shown[shown.length - 1];
  const track = trackWith(shown.length);

  return (
    <View>
      {/*
        读数条占一个固定的位置，不是按住才出现。
        按住才长出来的话，整张图会往下跳一行，手指底下的那根柱子就不再是刚才
        瞄准的那根了。没按住时显示最后一根——也就是最新的那根。
      */}
      <CandleReadout bar={shownBar} live={active !== null} />
      <View style={styles.legend}>
        {averages.map((line) => (
          <Text
            key={line.label}
            style={[styles.legendText, { color: line.color }]}
          >
            {line.label}{" "}
            {fixedOrMissing(
              (activeIndex === null
                ? line.values[line.values.length - 1]
                : line.values[activeIndex]) ?? null,
              2,
            )}
          </Text>
        ))}
      </View>

      <View
        onLayout={measure}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={track}
        onResponderMove={track}
        onResponderRelease={clear}
        onResponderTerminate={clear}
        onStartShouldSetResponder={() => true}
        style={styles.canvas}
        testID="price-chart-canvas"
      >
        {/*
          影线和实体是画布的**直接**子元素。

          此前每根柱子外面套了一层没有样式的 View——RN 里 position:absolute 是
          相对**父元素**定位的，那层 View 自己在流里、尺寸为零，于是所有柱子
          都以它为原点排了出去：画布是空的，蜡烛叠在页面顶上的报价头上。
          它不报错，用例断言文字也照样通过。
        */}
        {shown.flatMap((entry, index) => {
          const top = ratio(bounds, Math.max(entry.open, entry.close));
          const bottom = ratio(bounds, Math.min(entry.open, entry.close));
          const color = signColor(entry.close - entry.open);
          return [
            <View
              key={`wick-${entry.date}`}
              pointerEvents="none"
              style={[
                styles.wick,
                {
                  backgroundColor: color,
                  bottom: ratio(bounds, entry.low) * CHART_HEIGHT,
                  height: Math.max(
                    (ratio(bounds, entry.high) - ratio(bounds, entry.low)) *
                      CHART_HEIGHT,
                    1,
                  ),
                  left: `${index * step + step / 2}%`,
                },
              ]}
            />,
            /* 实体给 1px 下限：平盘那天否则会整根消失。 */
            <View
              key={`body-${entry.date}`}
              pointerEvents="none"
              style={[
                styles.body,
                {
                  backgroundColor: color,
                  bottom: bottom * CHART_HEIGHT,
                  height: Math.max((top - bottom) * CHART_HEIGHT, 1),
                  left: `${index * step}%`,
                  width: `${Math.max(step - 0.2, 0.6)}%`,
                },
              ]}
            />,
          ];
        })}

        {averages.map((line) => (
          <Polyline
            bounds={bounds}
            color={line.color}
            key={line.label}
            name={line.label}
            values={line.values}
          />
        ))}

        {activeIndex === null ? null : (
          <Crosshair
            left={`${(activeIndex + 0.5) * step}%`}
            value={
              shownBar === undefined
                ? null
                : ratio(bounds, shownBar.close) * CHART_HEIGHT
            }
          />
        )}

        <AxisTick align="top" text={bounds.high.toFixed(2)} />
        <AxisTick align="bottom" text={bounds.low.toFixed(2)} />
      </View>

      <View style={styles.volumeCanvas}>
        {shown.map((entry, index) => (
          <View
            key={`v-${entry.date}`}
            style={[
              styles.volumeBar,
              {
                backgroundColor: signColor(entry.close - entry.open),
                height: Math.max(
                  (entry.volumeShares / volumeTop) * VOLUME_HEIGHT,
                  1,
                ),
                left: `${index * step}%`,
                width: `${Math.max(step - 0.2, 0.5)}%`,
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
  axis: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  axisText: {
    color: tokens.text.tertiary,
    fontSize: 11.5,
    fontVariant: ["tabular-nums"],
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
    /*
     * 越界的部分要裁掉。
     *
     * 均线在窗口边缘会短暂探出纵轴之外，不裁的话那一截会画到画布外面、压在
     * 别的内容上——那正是这一版之前整张图跑到报价头上去的同一类问题。
     */
    overflow: "hidden",
    position: "relative",
  },
  crosshair: {
    backgroundColor: tokens.text.tertiary,
    bottom: 0,
    position: "absolute",
    top: 0,
    width: 1,
  },
  crosshairLevel: {
    backgroundColor: tokens.text.tertiary,
    height: 1,
    left: 0,
    position: "absolute",
    right: 0,
  },
  legend: {
    columnGap: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    paddingBottom: 4,
    paddingHorizontal: 12,
  },
  legendText: {
    fontSize: 11.5,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
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
  tick: {
    color: tokens.text.tertiary,
    fontSize: 10.5,
    fontVariant: ["tabular-nums"],
    paddingHorizontal: 4,
    position: "absolute",
    right: 0,
  },
  tickBottom: {
    bottom: 2,
  },
  tickMiddle: {
    top: CHART_HEIGHT / 2 - 7,
  },
  tickTop: {
    top: 2,
  },
  volumeBar: {
    bottom: 0,
    position: "absolute",
  },
  volumeCanvas: {
    height: VOLUME_HEIGHT,
    marginHorizontal: 12,
    marginTop: 6,
    overflow: "hidden",
    position: "relative",
  },
  wick: {
    position: "absolute",
    width: 1,
  },
});
