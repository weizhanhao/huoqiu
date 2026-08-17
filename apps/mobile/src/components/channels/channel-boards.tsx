import { tokens } from "@huoqiu/native-ui";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { EtfRow, FundRow, PrivateFundManager } from "../../api/market-api";
import { appTouchMinimum } from "../../styles/app-touch";
import { useSignColor } from "../../styles/market-colors";
import { fixedOrMissing, signedPercent } from "../../styles/market-sign";

/*
 * 基金 / ETF / 私募三个频道顶上的真实榜单。
 *
 * 这三个频道原来只筛帖子：站上没人写过基金，整屏就空着，只留一句「在帖子里
 * 写上基金代码，就会出现在这里」。可频道名承诺的是「这里有基金」，不是「这里
 * 有人聊过基金」——而三张真名单服务端一直都在回：场内 ETF 走行情接口，场外
 * 基金走净值接口，私募走中基协的备案公示。
 *
 * 于是改成名单在上、讨论在下。空的是讨论，不是频道。
 */

const Notice = ({ text }: Readonly<{ text: string }>) => (
  <View style={styles.notice}>
    <Text style={styles.noticeText}>{text}</Text>
  </View>
);

const Header = ({
  subtitle,
  title,
}: Readonly<{ subtitle: string; title: string }>) => (
  <View style={styles.header}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.subtitle}>{subtitle}</Text>
  </View>
);

/*
 * 「还没取到」和「一条都没有」要分开说。
 *
 * 合成一句的话，网慢时用户看到的是「今天没有基金」——那是假的，而且没有任何
 * 线索指向真正的原因。
 */
const emptyState = (rows: readonly unknown[] | null, what: string) => {
  if (rows === null) return <Notice text={`正在读取${what}……`} />;
  if (rows.length === 0) return <Notice text={`没有取到${what}。`} />;
  return null;
};

/* ------------------------------------------------------------------ 基金 */

export function FundBoard({
  funds,
}: Readonly<{
  /** null 表示还没取到。 */
  funds: readonly FundRow[] | null;
}>) {
  const signColor = useSignColor();
  const rows = (funds ?? []).slice(0, 10);

  return (
    <View style={styles.block} testID="fund-board">
      <Header subtitle="指数型 · 按日涨幅排" title="基金净值榜" />
      {emptyState(funds, "基金名单")}
      {rows.map((row) => (
        <View key={row.code} style={styles.row}>
          <View style={styles.rowMain}>
            <Text numberOfLines={1} style={styles.rowName}>
              {row.name}
            </Text>
            {/*
              净值是哪一天的必须写出来。基金净值天然滞后一到两个交易日，不标
              日期，这个数会被当成此刻的价——而它不是。
            */}
            <Text style={styles.rowMeta}>
              {row.code} · {row.category} · {row.navDate}
            </Text>
          </View>
          <View style={styles.rowNumbers}>
            <Text style={styles.rowValue}>{fixedOrMissing(row.nav, 4)}</Text>
            <Text style={[styles.rowPct, { color: signColor(row.dayPct) }]}>
              {signedPercent(row.dayPct)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------- ETF */

export function EtfBoard({
  etfs,
  onAdd,
  onOpen,
  watchlist,
}: Readonly<{
  etfs: readonly EtfRow[] | null;
  onAdd: (code: string, href: string) => void;
  onOpen: (href: string) => void;
  /** 已经在自选里的代码，用来决定按钮是「加自选」还是「已添加」。 */
  watchlist: readonly string[];
}>) {
  const signColor = useSignColor();
  const rows = (etfs ?? []).slice(0, 10);

  return (
    <View style={styles.block} testID="etf-board">
      <Header subtitle="场内 · 按成交额排" title="ETF 榜" />
      {emptyState(etfs, "ETF 名单")}
      {rows.map((row) => {
        const symbol = row.href === null ? null : row.href.split("/").pop();
        const added =
          symbol !== undefined && symbol !== null && watchlist.includes(symbol);
        return (
          <View key={row.code} style={styles.row}>
            <Pressable
              accessibilityRole="button"
              disabled={row.href === null}
              onPress={() => {
                if (row.href !== null) onOpen(row.href);
              }}
              style={styles.rowMain}
            >
              <Text numberOfLines={1} style={styles.rowName}>
                {row.name}
              </Text>
              <Text style={styles.rowMeta}>{row.code}</Text>
            </Pressable>
            <View style={styles.rowNumbers}>
              <Text style={styles.rowValue}>{fixedOrMissing(row.last, 3)}</Text>
              <Text
                style={[styles.rowPct, { color: signColor(row.changePercent) }]}
              >
                {signedPercent(row.changePercent)}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={
                added ? `${row.name} 已在自选里` : `把 ${row.name} 加进自选`
              }
              accessibilityRole="button"
              disabled={added || row.href === null}
              onPress={() => {
                if (!added && row.href !== null) onAdd(row.code, row.href);
              }}
              style={added ? styles.added : styles.add}
            >
              <Text style={added ? styles.addedText : styles.addText}>
                {added ? "已添加" : "加自选"}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ 私募 */

export function PrivateBoard({
  managers,
  onOpen,
}: Readonly<{
  managers: readonly PrivateFundManager[] | null;
  /** 打开中基协的公示页。 */
  onOpen: (url: string) => void;
}>) {
  const rows = (managers ?? []).slice(0, 10);

  return (
    <View style={styles.block} testID="private-board">
      <Header subtitle="来自中基协公示 · 按在管数量排" title="私募管理人" />
      {emptyState(managers, "私募名单")}
      {rows.map((row) => (
        <Pressable
          accessibilityLabel={`在中基协查看 ${row.name}`}
          accessibilityRole="button"
          key={row.name}
          onPress={() => {
            onOpen(row.disclosureUrl);
          }}
          style={styles.row}
        >
          <View style={styles.rowMain}>
            <Text numberOfLines={1} style={styles.rowName}>
              {row.name}
            </Text>
            {/*
              法定代表人和成立日期一起摆出来，是为了让人能在中基协页面上对得
              上号——同名的管理人不止一家。
            */}
            <Text style={styles.rowMeta}>
              {row.investType} · {row.legalPerson} · {row.establishedOn} 成立
            </Text>
          </View>
          <View style={styles.rowNumbers}>
            <Text style={styles.rowValue}>{row.fundCount}</Text>
            <Text style={styles.rowMeta}>在管</Text>
          </View>
        </Pressable>
      ))}
      {rows.length === 0 ? null : (
        <Text style={styles.footnote}>
          名单与备案信息来自中基协公示，点任意一行可回到原始出处核对。
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  add: {
    alignItems: "center",
    backgroundColor: tokens.brand.subtle,
    borderRadius: 6,
    justifyContent: "center",
    minHeight: appTouchMinimum,
    paddingHorizontal: 12,
  },
  addText: {
    color: tokens.brand.primary,
    fontSize: 13,
  },
  added: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: tokens.border.default,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: appTouchMinimum,
    paddingHorizontal: 12,
  },
  addedText: {
    color: tokens.text.tertiary,
    fontSize: 13,
  },
  block: {
    backgroundColor: tokens.surface.base,
    borderRadius: 12,
    marginBottom: 10,
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  footnote: {
    color: tokens.text.tertiary,
    fontSize: 12,
    marginTop: 8,
  },
  header: {
    gap: 2,
    marginBottom: 6,
  },
  notice: {
    paddingVertical: 12,
  },
  noticeText: {
    color: tokens.text.secondary,
    fontSize: 13.5,
  },
  row: {
    alignItems: "center",
    borderTopColor: tokens.border.subtle,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: appTouchMinimum,
    paddingVertical: 8,
  },
  rowMain: {
    flex: 1,
    gap: 2,
    justifyContent: "center",
  },
  rowMeta: {
    color: tokens.text.tertiary,
    fontSize: 12,
  },
  rowName: {
    color: tokens.text.primary,
    fontSize: 15,
    fontWeight: "500",
  },
  rowNumbers: {
    alignItems: "flex-end",
    gap: 2,
    minWidth: 76,
  },
  rowPct: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  rowValue: {
    color: tokens.text.primary,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  subtitle: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
  },
  title: {
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "600",
  },
});
