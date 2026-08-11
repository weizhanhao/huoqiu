import { tokens } from "@huoqiu/native-ui";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  settingsDensityOptions,
  type SettingsDensity,
} from "../../features/five-tab/synthetic-fixture";
import { appTouchMinimum } from "../../styles/app-touch";
import { ScreenHeader } from "../d0/screen-header";

type SettingsPanelProperties = Readonly<{
  density: SettingsDensity;
  onSelectDensity: (density: SettingsDensity) => void;
  onBack: () => void;
}>;

export function SettingsPanel({
  density,
  onSelectDensity,
  onBack,
}: SettingsPanelProperties) {
  return (
    <View style={styles.viewport}>
      <ScreenHeader onBack={onBack} subtitle="本次会话偏好" title="设置" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>界面密度</Text>
          <Text style={styles.sectionSubtitle}>会话结束后重置</Text>
          <View accessibilityRole="tablist" style={styles.densityTabs}>
            {settingsDensityOptions.map((option) => {
              const selected = density === option.id;
              return (
                <Pressable
                  accessibilityLabel={`使用${option.label}布局`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  aria-selected={selected}
                  key={option.id}
                  onPress={() => onSelectDensity(option.id)}
                  style={[
                    styles.densityTab,
                    selected && styles.densityTabSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.densityLabel,
                      selected && styles.densityLabelSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>行情显示</Text>
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>涨跌颜色</Text>
              <Text style={styles.settingMeta}>遵循当前产品语义</Text>
            </View>
            <Text style={styles.settingValue}>红涨绿跌</Text>
          </View>
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>数据模式</Text>
              <Text style={styles.settingMeta}>无网络请求</Text>
            </View>
            <Text style={styles.settingValue}>固定离线合成数据</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>账户能力</Text>
          <View style={styles.unavailableCard}>
            <Text style={styles.unavailableTitle}>未开放</Text>
            <Text style={styles.unavailableCopy}>
              证券、基金与真实交易能力仍为未开放；本页不会采集账户信息。
            </Text>
          </View>
        </View>

        <Text style={styles.disclosure}>
          设置仅保存在当前运行会话，不跨设备同步
        </Text>
      </ScrollView>
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
    paddingBottom: 36,
  },
  sectionCard: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  sectionTitle: {
    color: tokens.text.primary,
    fontSize: 19,
    fontWeight: "700",
  },
  sectionSubtitle: {
    color: tokens.text.secondary,
    fontSize: 11,
    paddingTop: 5,
  },
  densityTabs: {
    backgroundColor: tokens.surface.canvas,
    borderRadius: 14,
    flexDirection: "row",
    gap: 6,
    marginTop: 14,
    padding: 5,
  },
  densityTab: {
    alignItems: "center",
    borderRadius: 11,
    flex: 1,
    justifyContent: "center",
    minHeight: appTouchMinimum,
  },
  densityTabSelected: {
    backgroundColor: tokens.surface.base,
  },
  densityLabel: {
    color: tokens.text.secondary,
    fontSize: 14,
    fontWeight: "600",
  },
  densityLabelSelected: {
    color: tokens.brand.primaryHover,
  },
  settingRow: {
    alignItems: "center",
    borderTopColor: tokens.surface.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 70,
  },
  settingLabel: {
    color: tokens.text.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  settingMeta: {
    color: tokens.text.tertiary,
    fontSize: 10,
    paddingTop: 4,
  },
  settingValue: {
    color: tokens.brand.primaryHover,
    fontSize: 12,
    fontWeight: "600",
    maxWidth: 152,
    textAlign: "right",
  },
  unavailableCard: {
    backgroundColor: tokens.surface.subtle,
    borderRadius: 14,
    marginTop: 14,
    padding: 16,
  },
  unavailableTitle: {
    color: tokens.market.warningText,
    fontSize: 13,
    fontWeight: "700",
  },
  unavailableCopy: {
    color: tokens.text.secondary,
    fontSize: 12,
    lineHeight: 20,
    paddingTop: 7,
  },
  disclosure: {
    color: tokens.market.warningText,
    fontSize: 11,
    lineHeight: 18,
    textAlign: "center",
  },
});
