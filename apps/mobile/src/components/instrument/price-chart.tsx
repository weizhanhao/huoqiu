import { tokens } from "@huoqiu/native-ui";
import { Fragment, useCallback, useState } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import Svg, {
  Circle,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";

import type { ChartBar, ChartPoint, ChartSeries } from "../../api/market-api";
import { useSignColor } from "../../styles/market-colors";
import { signedPercent } from "../../styles/market-sign";
import type { Bounds } from "./chart-bounds";
import {
  axisLevels,
  barIndexAt,
  boundsOf,
  movingAverage,
} from "./chart-bounds";
import type { Geometry } from "./chart-geometry";
import {
  areaPath,
  geometryOf,
  linePath,
  visibleBarsFor,
} from "./chart-geometry";

/*
 * 分时与 K 线。
 *
 * 用 react-native-svg 画，不再用一堆 View 拼。
 *
 * 这是这一版最要紧的改动：View 只能摆矩形，画不了斜线，也画不出 1px 描边。
 * 上一版的均线是「每一列填一个从上一点高度连到这一点高度的矩形」——根数一少
 * （年K 十几根）每段就成了二十多点宽的实心**色块**，整张图是一堆彩色阶梯。
 * 在 SVG 里一条均线就是一个 <Path>：既是真的细线，节点数也从几十掉到一个。
 *
 * react-native-svg 就在 Expo Go 的内置模块清单里（15.12.1），不需要脱离
 * Expo Go——这也是它胜过任何第三方图表库的地方：那些库几乎都带自己的原生模块，
 * 一装进来这个工程就再也打不开 Expo Go。
 *
 * 版式照雪球：读数条 → 均线图例 → 主图（网格 + 纵轴刻度 + 最高最低标记）
 * → 量能区 → 时间轴。
 */

const CHART_HEIGHT = 208;
const VOLUME_HEIGHT = 52;
const PLOT_INSET = 8;

/*
 * 均线的线色与图例文字色分开。
 *
 * 线不是文字，不受正文对比度约束；可图例里的「MA5 40.34」是文字，直接拿那几个
 * 亮橙亮紫去写，白底上会掉到 2:1 以下——等于印了一行看不清的字。
 */
const MA_LINES = [
  { color: "#F0A020", label: "MA5", text: "#9A6000", window: 5 },
  { color: "#2E86DE", label: "MA10", text: "#1B62B0", window: 10 },
  { color: "#B558C8", label: "MA20", text: "#8B3AA0", window: 20 },
] as const;

const GRID_LINE = "#EDEEF1";
const GRID_COLUMN = "#F2F3F5";
const AXIS_TEXT = "#6B7280";
const MARKER_TEXT = "#4A5058";
const AVERAGE_LINE = "#F0A020";
const INTRADAY_LINE = "#1F6FD0";
const INTRADAY_FILL = "rgba(31,111,208,0.07)";

/*
 * 坐标轴上的日期。
 *
 * 各周期的 date 形状不一样：日/周/月是 2026-08-17，年是 2026，季是 2026Q3，
 * 分钟级上游给的是 202608171030 这样一串十二位数——原样印出来，图底下就是
 * 几串谁也读不出的数字。
 */
const axisLabel = (date: string | undefined): string => {
  if (date === undefined) return "";
  if (/^\d{12}$/u.test(date)) {
    return `${date.slice(4, 6)}-${date.slice(6, 8)} ${date.slice(8, 10)}:${date.slice(10, 12)}`;
  }
  /* 2026-08-17 → 2026-08：轴上三个刻度，写到日就挤成一团。 */
  if (/^\d{4}-\d{2}-\d{2}$/u.test(date)) return date.slice(0, 7);
  return date;
};

/*
 * 读数条上的日期写全。
 *
 * 轴上的刻度可以截到月（三个刻度写到日会挤成一团），可读数条回答的正是
 * 「这根是**哪一天**」——截成 2026-08 就把这个问题原样退了回去。
 */
const readoutLabel = (date: string): string => {
  if (/^\d{12}$/u.test(date)) {
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)} ${date.slice(8, 10)}:${date.slice(10, 12)}`;
  }
  return date;
};

/*
 * 纵轴以昨收为中心对称。
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

/** 价格 → 自顶向下的像素。 */
const scaleOf =
  ({ high, low }: Bounds, height: number) =>
  (value: number): number =>
    ((high - value) / (high - low)) * height;

/*
 * 网格与纵轴刻度。
 *
 * 刻度等分实际区间，不取整到「好看的数」——取整会让最上一档高出画面顶端，
 * 那一格刻度就飘在图外面了。
 */
const GridAndTicks = ({
  bounds,
  height,
  width,
}: Readonly<{ bounds: Bounds; height: number; width: number }>) => {
  const levels = axisLevels(bounds, 5);
  const yOf = scaleOf(bounds, height);
  return (
    <>
      {levels.map((level, index) => (
        <Line
          key={`h-${String(index)}`}
          stroke={GRID_LINE}
          strokeWidth={StyleSheet.hairlineWidth}
          x1={0}
          x2={width}
          y1={yOf(level)}
          y2={yOf(level)}
        />
      ))}
      {[1, 2, 3].map((part) => (
        <Line
          key={`v-${String(part)}`}
          stroke={GRID_COLUMN}
          strokeWidth={StyleSheet.hairlineWidth}
          x1={(width * part) / 4}
          x2={(width * part) / 4}
          y1={0}
          y2={height}
        />
      ))}
      {levels.map((level, index) => (
        <SvgText
          fill={AXIS_TEXT}
          fontSize={10}
          key={`t-${String(index)}`}
          x={3}
          /* 顶档压在线下方，其余压在各自线的上方，免得被裁掉。 */
          y={index === 0 ? 11 : yOf(level) - 3}
        >
          {level.toFixed(2)}
        </SvgText>
      ))}
    </>
  );
};

/** 最高价与最低价各一个标记：圆点 + 短横 + 价格。 */
const Extreme = ({
  atLeftHalf,
  price,
  x,
  y,
}: Readonly<{ atLeftHalf: boolean; price: number; x: number; y: number }>) => {
  /* 落在右半屏时标签往左伸，否则会被画布裁掉。 */
  const dash = atLeftHalf ? 8 : -8;
  return (
    <>
      <Circle cx={x} cy={y} fill={MARKER_TEXT} r={1.5} />
      <Line
        stroke={MARKER_TEXT}
        strokeWidth={1}
        x1={x}
        x2={x + dash}
        y1={y}
        y2={y}
      />
      <SvgText
        fill={MARKER_TEXT}
        fontSize={9.5}
        textAnchor={atLeftHalf ? "start" : "end"}
        x={x + dash + (atLeftHalf ? 2 : -2)}
        y={y + 3.5}
      >
        {price.toFixed(2)}
      </SvgText>
    </>
  );
};

/** 蜡烛：阳线空心、阴线实心；窄到画不出空心时退化成实心。 */
const Candles = ({
  bars,
  bounds,
  geometry,
  height,
  signColor,
}: Readonly<{
  bars: readonly ChartBar[];
  bounds: Bounds;
  geometry: Geometry;
  height: number;
  signColor: (change: number | null | undefined) => string;
}>) => {
  const yOf = scaleOf(bounds, height);
  return (
    <>
      {bars.map((bar, index) => {
        const color = signColor(bar.close - bar.open);
        const rising = bar.close >= bar.open;
        const top = yOf(Math.max(bar.open, bar.close));
        const bodyHeight = Math.max(
          yOf(Math.min(bar.open, bar.close)) - top,
          1,
        );
        const mid = geometry.xMid(index);
        return (
          <Fragment key={bar.date}>
            <Line
              stroke={color}
              strokeWidth={1}
              x1={mid}
              x2={mid}
              y1={yOf(bar.high)}
              y2={yOf(bar.low)}
            />
            <Rect
              /*
               * 空心阳线的内部必须是**画布底色**，不能用 transparent：影线是
               * 整根贯通画的，透明底会让它从实体正中间穿过去，成了个「井」字。
               */
              fill={rising && geometry.hollow ? tokens.surface.base : color}
              height={bodyHeight}
              stroke={color}
              strokeWidth={geometry.hollow ? 1 : 0}
              width={geometry.bodyWidth}
              x={geometry.xLeft(index)}
              y={top}
            />
          </Fragment>
        );
      })}
    </>
  );
};

/** 十字光标：一竖一横，横的那条落在手指所指的那个价上。 */
const Crosshair = ({
  height,
  width,
  x,
  y,
}: Readonly<{ height: number; width: number; x: number; y: number }>) => (
  <>
    <Line stroke={AXIS_TEXT} strokeWidth={1} x1={x} x2={x} y1={0} y2={height} />
    <Line stroke={AXIS_TEXT} strokeWidth={1} x1={0} x2={width} y1={y} y2={y} />
  </>
);

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
   * 先按屏宽估一个，量到了再换成真值。
   *
   * SVG 的坐标是像素，宽度为 0 时整张图画不出来。从 0 起步意味着第一帧永远
   * 是空白——切周期时会闪一下，而这一闪正好落在用户刚点完的那一刻。
   */
  const [plotWidth, setPlotWidth] = useState(() => {
    /*
     * 拿不到屏宽时按 390 估（iPhone 14/15 的宽度）。
     *
     * Dimensions 在还没挂到窗口上时回 0，用 0 起步意味着第一帧整张图是空白
     * ——切周期时会闪一下，而这一闪正好落在用户刚点完的那一刻。
     */
    const screen = Dimensions.get("window").width;
    return (screen > 0 ? screen : 390) - PLOT_INSET * 2;
  });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const measure = useCallback((event: LayoutChangeEvent) => {
    setPlotWidth(event.nativeEvent.layout.width);
  }, []);

  const clear = useCallback(() => {
    setActiveIndex(null);
  }, []);

  /* 有几列要到渲染分支才知道，所以由分支把数量绑进来。 */
  const trackWith =
    (count: number) =>
    (event: GestureResponderEvent): void => {
      setActiveIndex(barIndexAt(event.nativeEvent.locationX, plotWidth, count));
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
    const bounds =
      previousClose === null
        ? boundsOf(prices)
        : symmetricAround(previousClose, prices);
    const yOf = scaleOf(bounds, CHART_HEIGHT);
    const geometry = geometryOf(plotWidth, points.length);
    const volumeTop = Math.max(...points.map((entry) => entry.volumeShares), 1);
    const active = activeIndex === null ? null : points[activeIndex];
    const shown = active ?? points[points.length - 1];
    const track = trackWith(points.length);
    const swing =
      previousClose === null || previousClose === 0
        ? null
        : ((bounds.high - previousClose) / previousClose) * 100;

    const area = areaPath(prices, geometry.xMid, yOf, CHART_HEIGHT);
    const averageLine = linePath(
      points.map((entry) => entry.averagePrice),
      geometry.xMid,
      yOf,
    );
    const priceLine = linePath(prices, geometry.xMid, yOf);

    return (
      <View>
        <IntradayReadout
          live={active !== null}
          point={shown}
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
          style={styles.plot}
          testID="price-chart-canvas"
        >
          {plotWidth <= 0 ? null : (
            <Svg height={CHART_HEIGHT} width={plotWidth}>
              <GridAndTicks
                bounds={bounds}
                height={CHART_HEIGHT}
                width={plotWidth}
              />
              {area === null ? null : <Path d={area} fill={INTRADAY_FILL} />}
              {averageLine === null ? null : (
                <Path
                  d={averageLine}
                  fill="none"
                  stroke={AVERAGE_LINE}
                  strokeWidth={1}
                />
              )}
              {priceLine === null ? null : (
                <Path
                  d={priceLine}
                  fill="none"
                  stroke={INTRADAY_LINE}
                  strokeWidth={1.5}
                />
              )}
              {activeIndex === null || shown === undefined ? null : (
                <Crosshair
                  height={CHART_HEIGHT}
                  width={plotWidth}
                  x={geometry.xMid(activeIndex)}
                  y={yOf(shown.price)}
                />
              )}
              {/* 右侧那一列百分比——看分时的人真正在读的是「离昨收多远」。 */}
              {swing === null ? null : (
                <>
                  <SvgText
                    fill={signColor(1)}
                    fontSize={10}
                    textAnchor="end"
                    x={plotWidth - 3}
                    y={11}
                  >
                    {signedPercent(swing)}
                  </SvgText>
                  <SvgText
                    fill={AXIS_TEXT}
                    fontSize={10}
                    textAnchor="end"
                    x={plotWidth - 3}
                    y={CHART_HEIGHT / 2 + 3}
                  >
                    0.00%
                  </SvgText>
                  <SvgText
                    fill={signColor(-1)}
                    fontSize={10}
                    textAnchor="end"
                    x={plotWidth - 3}
                    y={CHART_HEIGHT - 4}
                  >
                    {signedPercent(-swing)}
                  </SvgText>
                </>
              )}
            </Svg>
          )}
        </View>

        <View style={styles.volumePlot}>
          {plotWidth <= 0 ? null : (
            <Svg height={VOLUME_HEIGHT} width={plotWidth}>
              {points.map((entry, index) => {
                const before = points[index - 1]?.price ?? entry.price;
                const barHeight = Math.max(
                  (entry.volumeShares / volumeTop) * VOLUME_HEIGHT,
                  1,
                );
                return (
                  <Rect
                    fill={signColor(entry.price - before)}
                    height={barHeight}
                    key={`v-${entry.time}-${String(index)}`}
                    width={geometry.bodyWidth}
                    x={geometry.xLeft(index)}
                    y={VOLUME_HEIGHT - barHeight}
                  />
                );
              })}
            </Svg>
          )}
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

  /* 均线在全量上算再截显示段：只拿屏上这几十根算，头几根的 MA20 会白白缺掉。 */
  const closes = bars.map((entry) => entry.close);
  const visible = visibleBarsFor(series.period);
  const averages = MA_LINES.map((line) => ({
    ...line,
    values: movingAverage(closes, line.window).slice(-visible),
  }));

  const shownBars = bars.slice(-visible);
  const bounds = boundsOf([
    ...shownBars.map((entry) => entry.high),
    ...shownBars.map((entry) => entry.low),
    /* 均线也要进纵轴，否则它会画到框外去。 */
    ...averages.flatMap((line) =>
      line.values.filter((value): value is number => value !== null),
    ),
  ]);
  const yOf = scaleOf(bounds, CHART_HEIGHT);
  const geometry = geometryOf(plotWidth, shownBars.length);
  const volumeTop = Math.max(
    ...shownBars.map((entry) => entry.volumeShares),
    1,
  );
  const active = activeIndex === null ? null : shownBars[activeIndex];
  const shownBar = active ?? shownBars[shownBars.length - 1];
  const track = trackWith(shownBars.length);

  let highestAt = 0;
  let lowestAt = 0;
  for (const [index, entry] of shownBars.entries()) {
    if (entry.high > (shownBars[highestAt]?.high ?? -Infinity))
      highestAt = index;
    if (entry.low < (shownBars[lowestAt]?.low ?? Infinity)) lowestAt = index;
  }
  const highest = shownBars[highestAt];
  const lowest = shownBars[lowestAt];

  return (
    <View>
      <CandleReadout bar={shownBar} live={active !== null} />

      <View style={styles.legend}>
        <Text style={styles.legendLabel}>均线</Text>
        {averages.map((line) => {
          const value =
            activeIndex === null
              ? line.values[line.values.length - 1]
              : line.values[activeIndex];
          return (
            <Text
              key={line.label}
              style={[styles.legendText, { color: line.text }]}
            >
              {line.label}{" "}
              {value === null || value === undefined ? "—" : value.toFixed(2)}
            </Text>
          );
        })}
      </View>

      <View
        onLayout={measure}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={track}
        onResponderMove={track}
        onResponderRelease={clear}
        onResponderTerminate={clear}
        onStartShouldSetResponder={() => true}
        style={styles.plot}
        testID="price-chart-canvas"
      >
        {plotWidth <= 0 ? null : (
          <Svg height={CHART_HEIGHT} width={plotWidth}>
            <GridAndTicks
              bounds={bounds}
              height={CHART_HEIGHT}
              width={plotWidth}
            />
            <Candles
              bars={shownBars}
              bounds={bounds}
              geometry={geometry}
              height={CHART_HEIGHT}
              signColor={signColor}
            />
            {averages.map((line) => {
              const path = linePath(line.values, geometry.xMid, yOf);
              return path === null ? null : (
                <Path
                  d={path}
                  fill="none"
                  key={line.label}
                  stroke={line.color}
                  strokeWidth={1}
                />
              );
            })}
            {highest === undefined ? null : (
              <Extreme
                atLeftHalf={highestAt < shownBars.length / 2}
                price={highest.high}
                x={geometry.xMid(highestAt)}
                y={yOf(highest.high)}
              />
            )}
            {lowest === undefined ? null : (
              <Extreme
                atLeftHalf={lowestAt < shownBars.length / 2}
                price={lowest.low}
                x={geometry.xMid(lowestAt)}
                y={yOf(lowest.low)}
              />
            )}
            {activeIndex === null || shownBar === undefined ? null : (
              <Crosshair
                height={CHART_HEIGHT}
                width={plotWidth}
                x={geometry.xMid(activeIndex)}
                y={yOf(shownBar.close)}
              />
            )}
          </Svg>
        )}
      </View>

      <View style={styles.volumePlot}>
        {plotWidth <= 0 ? null : (
          <Svg height={VOLUME_HEIGHT} width={plotWidth}>
            {shownBars.map((entry, index) => {
              const color = signColor(entry.close - entry.open);
              const rising = entry.close >= entry.open;
              const barHeight = Math.max(
                (entry.volumeShares / volumeTop) * VOLUME_HEIGHT,
                1,
              );
              /* 太矮的柱子画不出空心，描边会把整根吃掉。 */
              const outlined = rising && geometry.hollow && barHeight > 3;
              return (
                <Rect
                  fill={outlined ? tokens.surface.base : color}
                  height={barHeight}
                  key={`v-${entry.date}`}
                  stroke={color}
                  strokeWidth={outlined ? 1 : 0}
                  width={geometry.bodyWidth}
                  x={geometry.xLeft(index)}
                  y={VOLUME_HEIGHT - barHeight}
                />
              );
            })}
          </Svg>
        )}
      </View>

      <View style={styles.axis}>
        <Text style={styles.axisText}>{axisLabel(shownBars[0]?.date)}</Text>
        <Text style={styles.axisText}>
          {axisLabel(shownBars[Math.floor(shownBars.length / 2)]?.date)}
        </Text>
        <Text style={styles.axisText}>
          {axisLabel(shownBars[shownBars.length - 1]?.date)}
        </Text>
      </View>
    </View>
  );
}

/*
 * 手指底下那根柱子的读数。
 *
 * 一张 K 线图最常被问的是「这根是哪天、多少钱」。柱子只有几个像素宽，光看图
 * 猜不出来。读数条占固定位置而不是按住才出现——按住才长出来的话整张图会往下
 * 跳一行，手指底下就不再是刚才瞄准的那根了。
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
        {live ? readoutLabel(bar.date) : `最新 ${readoutLabel(bar.date)}`}
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

const styles = StyleSheet.create({
  axis: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: PLOT_INSET,
    paddingTop: 3,
  },
  axisText: {
    color: AXIS_TEXT,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
    lineHeight: 13,
  },
  legend: {
    columnGap: 10,
    flexDirection: "row",
    paddingBottom: 4,
    paddingHorizontal: PLOT_INSET,
  },
  legendLabel: {
    color: AXIS_TEXT,
    fontSize: 10.5,
    lineHeight: 14,
  },
  legendText: {
    fontSize: 10.5,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    lineHeight: 14,
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
  plot: {
    backgroundColor: tokens.surface.base,
    height: CHART_HEIGHT,
    marginHorizontal: PLOT_INSET,
  },
  readout: {
    alignItems: "center",
    columnGap: 9,
    flexDirection: "row",
    flexWrap: "wrap",
    paddingBottom: 2,
    paddingHorizontal: PLOT_INSET,
    paddingTop: 6,
    rowGap: 1,
  },
  readoutCell: {
    color: tokens.text.secondary,
    fontSize: 11.5,
    fontVariant: ["tabular-nums"],
    lineHeight: 15,
  },
  readoutDate: {
    color: tokens.text.primary,
    fontSize: 11.5,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    lineHeight: 15,
  },
  volumePlot: {
    height: VOLUME_HEIGHT,
    marginHorizontal: PLOT_INSET,
    marginTop: 3,
  },
});
