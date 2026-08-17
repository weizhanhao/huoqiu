import { tokens } from "@huoqiu/native-ui";
import { StyleSheet, Text, View } from "react-native";

import type { OrderBookLevel, Tick } from "../../api/market-api";
import { useSignColor } from "../../styles/market-colors";
import { MISSING, fixedOrMissing } from "../../styles/market-sign";

/*
 * 五档盘口与成交明细。
 *
 * 服务端 /api/market/instrument-live 一直在回这两块（quote.asks / quote.bids
 * 与 tape.ticks），移动端此前一个字都没接——盯盘的人看的就是这两块：委托堆在
 * 哪一档、最近几笔是买是卖。缺了它，个股页只是一张会变数字的静态卡片。
 */

/* A 股一手一百股。盘口和明细上游给的都是股，界面按手读。 */
const lots = (shares: number | null): string =>
  shares === null ? MISSING : String(Math.round(shares / 100));

const askLabels = ["卖五", "卖四", "卖三", "卖二", "卖一"] as const;
const bidLabels = ["买一", "买二", "买三", "买四", "买五"] as const;

const Row = ({
  label,
  level,
  tone,
}: Readonly<{
  label: string;
  level: OrderBookLevel | undefined;
  tone: string;
}>) => (
  <View style={styles.bookRow}>
    <Text style={styles.bookLabel}>{label}</Text>
    <Text style={[styles.bookPrice, { color: tone }]}>
      {fixedOrMissing(level?.price ?? null, 2)}
    </Text>
    <Text style={styles.bookVolume}>{lots(level?.volume ?? null)}</Text>
  </View>
);

export function OrderBook({
  asks,
  bids,
}: Readonly<{
  /** 卖一到卖五，价格递增。null 表示这一路没取到。 */
  asks: readonly OrderBookLevel[] | null;
  /** 买一到买五，价格递减。 */
  bids: readonly OrderBookLevel[] | null;
}>) {
  const signColor = useSignColor();

  /*
   * 卖档要倒过来印：屏幕上从上到下是卖五→卖一→买一→买五，价格自上而下递减，
   * 和交易所的挂单簿一个方向。照着数组顺序印，卖一会跑到最上面，整块读反。
   *
   * 不能用 toReversed——Hermes 没有这个方法，真机上整屏红，而用例跑在 Node 上
   * 照样全绿。也不能直接 .reverse()：那会就地改掉传进来的数组。
   */
  const askRows = asks === null ? [] : [...asks].reverse();

  /*
   * 委卖用跌色、委买用涨色，是盘口的固定读法（挂单方向，不是价格涨跌），
   * 所以跟着账号选的配色走：选了绿涨红跌的人，这里的买卖两侧也要跟着换。
   */
  const askTone = signColor(-1);
  const bidTone = signColor(1);

  if (asks === null && bids === null) {
    return (
      <View style={styles.block}>
        <Text style={styles.title}>五档</Text>
        <Text style={styles.empty}>盘口暂时取不到。</Text>
      </View>
    );
  }

  return (
    <View style={styles.block} testID="order-book">
      <Text style={styles.title}>五档</Text>
      {askLabels.map((label, index) => (
        <Row key={label} label={label} level={askRows[index]} tone={askTone} />
      ))}
      <View style={styles.divider} />
      {bidLabels.map((label, index) => (
        <Row
          key={label}
          label={label}
          level={(bids ?? [])[index]}
          tone={bidTone}
        />
      ))}
    </View>
  );
}

/** 主动买记作涨向、主动卖记作跌向；分不清的走中性色。 */
const sideSign = (side: Tick["side"]): number | null => {
  if (side === "buy") return 1;
  if (side === "sell") return -1;
  return null;
};

export function TapeList({
  previousClose,
  ticks,
}: Readonly<{
  /** 拿来判断每一笔相对昨收是涨是跌。 */
  previousClose: number | null;
  /** 最近的在最前面。null 表示这一路没取到。 */
  ticks: readonly Tick[] | null;
}>) {
  const signColor = useSignColor();

  if (ticks === null || ticks.length === 0) {
    return (
      <View style={styles.block}>
        <Text style={styles.title}>明细</Text>
        <Text style={styles.empty}>
          {ticks === null ? "明细暂时取不到。" : "今天还没有成交。"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.block} testID="tape-list">
      <Text style={styles.title}>明细</Text>
      <View style={styles.tapeHead}>
        <Text style={styles.tapeHeadCell}>时间</Text>
        <Text style={[styles.tapeHeadCell, styles.tapeRight]}>价格</Text>
        <Text style={[styles.tapeHeadCell, styles.tapeRight]}>手数</Text>
      </View>
      {ticks.map((tick, index) => (
        <View key={`${tick.time}-${String(index)}`} style={styles.tapeRow}>
          <Text style={styles.tapeTime}>{tick.time}</Text>
          <Text
            style={[
              styles.tapePrice,
              {
                color: signColor(
                  previousClose === null ? null : tick.price - previousClose,
                ),
              },
            ]}
          >
            {tick.price.toFixed(2)}
          </Text>
          {/*
            主动买还是主动卖，是明细这一列真正的信息量——只印价和量，看到的
            只是「成交了」，看不出是谁在推。上游分不清时给 neutral，那就照实
            走中性色，不硬派一个方向。
          */}
          <Text
            style={[styles.tapeVolume, { color: signColor(sideSign(tick.side)) }]}
          >
            {lots(tick.volumeShares)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: tokens.surface.base,
    borderRadius: 12,
    gap: 2,
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bookLabel: {
    color: tokens.text.secondary,
    fontSize: 13,
    width: 36,
  },
  bookPrice: {
    flex: 1,
    fontSize: 13.5,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  bookRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingVertical: 3,
  },
  bookVolume: {
    color: tokens.text.primary,
    fontSize: 13.5,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    width: 78,
  },
  divider: {
    backgroundColor: tokens.border.subtle,
    height: 1,
    marginVertical: 5,
  },
  empty: {
    color: tokens.text.secondary,
    fontSize: 13,
    paddingVertical: 8,
  },
  tapeHead: {
    flexDirection: "row",
    paddingBottom: 4,
    paddingTop: 2,
  },
  tapeHeadCell: {
    color: tokens.text.tertiary,
    flex: 1,
    fontSize: 12,
  },
  tapePrice: {
    flex: 1,
    fontSize: 13.5,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  tapeRight: {
    textAlign: "right",
  },
  tapeRow: {
    flexDirection: "row",
    paddingVertical: 3,
  },
  tapeTime: {
    color: tokens.text.secondary,
    flex: 1,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  tapeVolume: {
    flex: 1,
    fontSize: 13.5,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  title: {
    color: tokens.text.primary,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
});
