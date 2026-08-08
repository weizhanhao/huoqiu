import { tokens } from "@huoqiu/native-ui";
import { ScrollView, StyleSheet, Text, View } from "react-native";

const observationLenses = [
  ["01", "公开披露", "先看可验证的公告、财报与公开材料。"],
  ["02", "市场脉络", "把变化放回时间线，区分事实与解释。"],
  ["03", "持续回看", "记录观察时点，让判断可以重新检视。"],
] as const;

export default function HomeScreen() {
  return (
    <ScrollView contentContainerStyle={styles.canvas} style={styles.viewport}>
      <View style={styles.shell}>
        <View style={styles.masthead}>
          <View style={styles.brandMark} accessibilityElementsHidden>
            <Text style={styles.brandGlyph}>火</Text>
          </View>
          <View>
            <Text style={styles.eyebrow}>PUBLIC MARKET NOTES</Text>
            <Text
              accessibilityRole="header"
              aria-level={1}
              role="heading"
              style={styles.heading}
            >
              火球
            </Text>
          </View>
        </View>

        <View style={styles.lead}>
          <Text style={styles.sectionLabel}>今日开场</Text>
          <Text style={styles.leadTitle}>让公开信息形成可回看的市场脉络。</Text>
          <Text style={styles.leadSummary}>公开市场信息的观察与整理</Text>
        </View>

        <View style={styles.marketKey}>
          <Text style={styles.marketKeyTitle}>市场颜色</Text>
          <View style={styles.keyRow}>
            <View style={styles.keyItem}>
              <View style={styles.upDot} />
              <Text style={styles.keyText}>上涨</Text>
            </View>
            <View style={styles.keyItem}>
              <View style={styles.downDot} />
              <Text style={styles.keyText}>下跌</Text>
            </View>
          </View>
          <Text style={styles.keyNote}>颜色只标记公开市场的方向变化。</Text>
        </View>

        <View style={styles.notebook}>
          <View style={styles.notebookHeading}>
            <Text style={styles.sectionLabel}>观察方法</Text>
            <Text style={styles.notebookTitle}>三层信息笔记</Text>
          </View>
          {observationLenses.map(([index, label, detail]) => (
            <View key={index} style={styles.lensRow}>
              <Text style={styles.lensIndex}>{index}</Text>
              <View style={styles.lensCopy}>
                <Text style={styles.lensTitle}>{label}</Text>
                <Text style={styles.lensDetail}>{detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerCode}>HQ / ALPHA</Text>
          <Text style={styles.footerText}>从可验证的公开资料出发。</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  viewport: {
    backgroundColor: tokens.surface.canvas,
  },
  canvas: {
    alignItems: "center",
    borderTopColor: tokens.brand.primary,
    borderTopWidth: 4,
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  shell: {
    maxWidth: 720,
    width: "100%",
  },
  masthead: {
    alignItems: "center",
    borderBottomColor: tokens.surface.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    paddingBottom: 20,
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: tokens.brand.primary,
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    transform: [{ rotate: "-8deg" }],
    width: 48,
  },
  brandGlyph: {
    color: tokens.brand.onPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  eyebrow: {
    color: tokens.text.tertiary,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  heading: {
    color: tokens.text.primary,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -1.5,
    lineHeight: 36,
  },
  lead: {
    borderLeftColor: tokens.brand.primary,
    borderLeftWidth: 4,
    marginVertical: 32,
    paddingLeft: 20,
  },
  sectionLabel: {
    color: tokens.text.tertiary,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  leadTitle: {
    color: tokens.text.primary,
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1.8,
    lineHeight: 42,
    paddingBottom: 20,
    paddingTop: 12,
  },
  leadSummary: {
    color: tokens.text.secondary,
    fontSize: 17,
    lineHeight: 28,
  },
  marketKey: {
    backgroundColor: tokens.surface.inverse,
    borderRadius: 12,
    marginBottom: 24,
    padding: 20,
  },
  marketKeyTitle: {
    color: tokens.text.inverse,
    fontSize: 14,
    fontWeight: "600",
  },
  keyRow: {
    flexDirection: "row",
    gap: 24,
    paddingBottom: 12,
    paddingTop: 16,
  },
  keyItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  upDot: {
    backgroundColor: tokens.market.up,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  downDot: {
    backgroundColor: tokens.market.down,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  keyText: {
    color: tokens.text.inverse,
    fontSize: 14,
  },
  keyNote: {
    color: tokens.text.disabled,
    fontSize: 12,
    lineHeight: 18,
  },
  notebook: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  notebookHeading: {
    backgroundColor: tokens.surface.subtle,
    padding: 20,
  },
  notebookTitle: {
    color: tokens.text.primary,
    fontSize: 25,
    fontWeight: "700",
    letterSpacing: -1,
    paddingTop: 8,
  },
  lensRow: {
    alignItems: "flex-start",
    borderBottomColor: tokens.surface.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 16,
    padding: 20,
  },
  lensIndex: {
    color: tokens.brand.primary,
    fontSize: 13,
    fontWeight: "700",
    paddingTop: 2,
  },
  lensCopy: {
    flex: 1,
  },
  lensTitle: {
    color: tokens.text.primary,
    fontSize: 17,
    fontWeight: "600",
    paddingBottom: 6,
  },
  lensDetail: {
    color: tokens.text.secondary,
    fontSize: 14,
    lineHeight: 22,
  },
  footer: {
    alignItems: "flex-start",
    gap: 6,
    paddingTop: 20,
  },
  footerCode: {
    color: tokens.text.tertiary,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  footerText: {
    color: tokens.text.secondary,
    fontSize: 13,
  },
});
