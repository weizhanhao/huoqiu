import { tokens } from "@huoqiu/native-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { SearchHit } from "../../api/market-api";
import { appTouchMinimum } from "../../styles/app-touch";

/*
 * 新建组合。
 *
 * 这个入口此前点了只弹一句「这一块还没做」，而服务端的建组合接口一直在那儿。
 *
 * 服务端的规矩照搬到界面上，不等提交才告诉人：名称 1–40 字、至少一只持仓、
 * 每项权重大于 0、合计必须是 100%。合计那条尤其要当场显示——攒够十只再被退回
 * 一句「当前为 97%」，人得自己一项项去找差在哪。
 */

export const TOTAL_WEIGHT = 100;
/** 与服务端一致。浮点加法凑不出恰好 100，留一点余量。 */
export const WEIGHT_TOLERANCE = 0.01;
export const MAX_NAME = 40;

export type DraftHolding = Readonly<{
  name: string;
  symbol: string;
  /** 用户正在输入的原文，不是数字：清空输入框时不该被 0 顶替。 */
  weight: string;
}>;

export const totalWeight = (holdings: readonly DraftHolding[]): number =>
  holdings.reduce((sum, holding) => {
    const parsed = Number.parseFloat(holding.weight);
    return sum + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);

export const canSave = (
  name: string,
  holdings: readonly DraftHolding[],
): boolean =>
  name.trim().length > 0 &&
  name.trim().length <= MAX_NAME &&
  holdings.length > 0 &&
  holdings.every((holding) => {
    const parsed = Number.parseFloat(holding.weight);
    return Number.isFinite(parsed) && parsed > 0;
  }) &&
  Math.abs(totalWeight(holdings) - TOTAL_WEIGHT) <= WEIGHT_TOLERANCE;

export type PortfolioComposerProperties = Readonly<{
  failure: string | null;
  holdings: readonly DraftHolding[];
  name: string;
  onChangeName: (name: string) => void;
  onChangeQuery: (query: string) => void;
  onChangeSummary: (summary: string) => void;
  onChangeWeight: (symbol: string, weight: string) => void;
  onClose: () => void;
  onPick: (hit: SearchHit) => void;
  onRemove: (symbol: string) => void;
  onSubmit: () => void;
  onTogglePicker: () => void;
  picking: boolean;
  query: string;
  /** null 表示还没搜；空数组表示搜过了，确实没有。 */
  results: readonly SearchHit[] | null;
  resultsFailure: string | null;
  saving: boolean;
  summary: string;
}>;

export function PortfolioComposer({
  failure,
  holdings,
  name,
  onChangeName,
  onChangeQuery,
  onChangeSummary,
  onChangeWeight,
  onClose,
  onPick,
  onRemove,
  onSubmit,
  onTogglePicker,
  picking,
  query,
  results,
  resultsFailure,
  saving,
  summary,
}: PortfolioComposerProperties) {
  const insets = useSafeAreaInsets();
  const total = totalWeight(holdings);
  const ready = canSave(name, holdings) && !saving;
  const off = total - TOTAL_WEIGHT;

  return (
    /*
     * 键盘弹起来时要把底下这块顶上去。
     *
     * iOS 上 RN 默认不做避让：底部那条输入栏会整个被键盘盖住——用户看不见
     * 自己在打什么字。Android 由系统 adjustResize 处理，所以只在 iOS 上加
     * behavior。
     */
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
      testID="portfolio-composer"
    >
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityLabel="关闭"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.topAction}
        >
          <Text style={styles.topGlyph}>✕</Text>
        </Pressable>
        <Text style={styles.topTitle}>新建组合</Text>
        <Pressable
          accessibilityRole="button"
          disabled={!ready}
          onPress={onSubmit}
          style={[styles.save, ready ? null : styles.saveOff]}
          testID="portfolio-save"
        >
          <Text style={styles.saveText}>{saving ? "保存中" : "保存"}</Text>
        </Pressable>
      </View>

      {failure === null ? null : (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{failure}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        style={styles.body}
      >
        <TextInput
          maxLength={MAX_NAME}
          onChangeText={onChangeName}
          placeholder="组合名称"
          placeholderTextColor={tokens.text.disabled}
          style={styles.name}
          value={name}
        />
        <TextInput
          multiline
          onChangeText={onChangeSummary}
          placeholder="一句话说清这个组合在做什么（可不填）"
          placeholderTextColor={tokens.text.disabled}
          style={styles.summary}
          value={summary}
        />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>权重合计</Text>
          <Text
            style={[
              styles.totalValue,
              Math.abs(off) <= WEIGHT_TOLERANCE ? styles.totalOk : null,
            ]}
          >
            {total.toFixed(2)}%
          </Text>
        </View>
        {Math.abs(off) <= WEIGHT_TOLERANCE ? null : (
          <Text style={styles.totalHint}>
            还差 {(-off).toFixed(2)} 个百分点才够 100%。
          </Text>
        )}

        {holdings.length === 0 ? (
          <Text style={styles.empty}>还没有持仓。先加一只。</Text>
        ) : null}

        {holdings.map((holding) => (
          <View key={holding.symbol} style={styles.holding}>
            <View style={styles.holdingMain}>
              <Text numberOfLines={1} style={styles.holdingName}>
                {holding.name}
              </Text>
              <Text style={styles.holdingSymbol}>
                {holding.symbol.toUpperCase()}
              </Text>
            </View>
            <TextInput
              inputMode="decimal"
              onChangeText={(text) => {
                onChangeWeight(holding.symbol, text);
              }}
              placeholder="权重"
              placeholderTextColor={tokens.text.disabled}
              style={styles.weight}
              value={holding.weight}
            />
            <Text style={styles.percent}>%</Text>
            <Pressable
              accessibilityLabel={`移除 ${holding.name}`}
              accessibilityRole="button"
              onPress={() => {
                onRemove(holding.symbol);
              }}
              style={styles.remove}
            >
              <Text style={styles.removeText}>移除</Text>
            </Pressable>
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          onPress={onTogglePicker}
          style={styles.add}
        >
          <Text style={styles.addText}>{picking ? "收起" : "＋ 添加标的"}</Text>
        </Pressable>

        {picking ? (
          <View style={styles.picker}>
            <TextInput
              autoFocus
              onChangeText={onChangeQuery}
              placeholder="搜股票 · 基金 · ETF"
              placeholderTextColor={tokens.text.tertiary}
              style={styles.pickerInput}
              value={query}
            />
            {resultsFailure === null ? null : (
              <Text style={styles.pickerHint}>{resultsFailure}</Text>
            )}
            {resultsFailure === null &&
            results === null &&
            query.trim().length > 0 ? (
              <Text style={styles.pickerHint}>正在搜……</Text>
            ) : null}
            {results !== null && results.length === 0 ? (
              <Text style={styles.pickerHint}>没有匹配的标的。</Text>
            ) : null}
            {(results ?? [])
              /* 没有站内代码的加进来也算不出行情，收益会永远是「—」。 */
              .filter((hit) => hit.symbol !== null)
              .map((hit) => (
                <Pressable
                  accessibilityRole="button"
                  key={`${hit.kind}-${hit.code}`}
                  onPress={() => {
                    onPick(hit);
                  }}
                  style={styles.pickerRow}
                >
                  <Text style={styles.pickerName}>{hit.name}</Text>
                  <Text style={styles.pickerCode}>{hit.code}</Text>
                </Pressable>
              ))}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  add: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderColor: tokens.border.default,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: appTouchMinimum,
  },
  addText: {
    color: tokens.brand.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  body: {
    flex: 1,
  },
  content: {
    gap: 10,
    padding: 16,
    paddingBottom: 40,
  },
  empty: {
    color: tokens.text.secondary,
    fontSize: 14,
    paddingVertical: 8,
  },
  holding: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderColor: tokens.border.default,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  holdingMain: {
    flex: 1,
    gap: 2,
  },
  holdingName: {
    color: tokens.text.primary,
    fontSize: 15,
  },
  holdingSymbol: {
    color: tokens.text.tertiary,
    fontSize: 12,
  },
  name: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.border.default,
    borderRadius: 10,
    borderWidth: 1,
    color: tokens.text.primary,
    fontSize: 17,
    fontWeight: "600",
    minHeight: appTouchMinimum,
    paddingHorizontal: 12,
  },
  notice: {
    backgroundColor: tokens.market.warningSubtle,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  noticeText: {
    color: tokens.market.warningText,
    fontSize: 13,
  },
  percent: {
    color: tokens.text.tertiary,
    fontSize: 14,
  },
  picker: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.border.default,
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  pickerCode: {
    color: tokens.text.tertiary,
    fontSize: 13,
  },
  pickerHint: {
    color: tokens.text.tertiary,
    fontSize: 13,
    padding: 12,
  },
  pickerInput: {
    backgroundColor: tokens.surface.canvas,
    borderRadius: 8,
    color: tokens.text.primary,
    fontSize: 15,
    margin: 10,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  pickerName: {
    color: tokens.text.primary,
    flex: 1,
    fontSize: 15,
  },
  pickerRow: {
    alignItems: "center",
    borderTopColor: tokens.border.subtle,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: appTouchMinimum,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  remove: {
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 4,
  },
  removeText: {
    color: tokens.text.tertiary,
    fontSize: 13,
  },
  save: {
    alignItems: "center",
    backgroundColor: tokens.brand.primary,
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: 16,
  },
  saveOff: {
    backgroundColor: tokens.brand.subtle,
  },
  saveText: {
    color: tokens.text.inverse,
    fontSize: 14,
    fontWeight: "600",
  },
  screen: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  summary: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.border.default,
    borderRadius: 10,
    borderWidth: 1,
    color: tokens.text.primary,
    fontSize: 15,
    minHeight: 72,
    padding: 12,
    textAlignVertical: "top",
  },
  topAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: appTouchMinimum,
    minWidth: 36,
  },
  topGlyph: {
    color: tokens.text.primary,
    fontSize: 20,
  },
  topTitle: {
    color: tokens.text.primary,
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  topbar: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingBottom: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  totalHint: {
    color: tokens.market.warningText,
    fontSize: 13,
  },
  totalLabel: {
    color: tokens.text.secondary,
    flex: 1,
    fontSize: 14,
  },
  totalOk: {
    color: tokens.market.downText,
  },
  totalRow: {
    alignItems: "center",
    flexDirection: "row",
    paddingTop: 6,
  },
  totalValue: {
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  weight: {
    color: tokens.text.primary,
    fontSize: 15,
    minWidth: 56,
    paddingVertical: 6,
    textAlign: "right",
  },
});
