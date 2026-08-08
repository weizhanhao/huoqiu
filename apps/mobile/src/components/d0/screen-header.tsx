import { tokens } from "@huoqiu/native-ui";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ScreenHeaderProperties = Readonly<{
  title: string;
  subtitle?: string;
  onSearch?: (() => void) | undefined;
}>;

export function ScreenHeader({
  title,
  subtitle,
  onSearch,
}: ScreenHeaderProperties) {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.identity}>
          <View
            accessibilityElementsHidden
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            style={styles.mark}
          >
            <Text style={styles.markText}>火</Text>
          </View>
          <View style={styles.copy}>
            <Text
              accessibilityRole="header"
              aria-level={1}
              role="heading"
              style={styles.title}
            >
              {title}
            </Text>
            {subtitle === undefined ? null : (
              <Text numberOfLines={1} style={styles.subtitle}>
                {subtitle}
              </Text>
            )}
          </View>
        </View>
        {onSearch === undefined ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>演示数据</Text>
          </View>
        ) : (
          <Pressable
            accessibilityLabel="搜索演示标的"
            accessibilityRole="button"
            onPress={onSearch}
            style={styles.search}
          >
            <Text style={styles.searchGlyph}>⌕</Text>
            <Text style={styles.searchText}>搜索</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: tokens.surface.base,
  },
  header: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    borderBottomColor: tokens.surface.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 76,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  identity: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
    minWidth: 0,
  },
  mark: {
    alignItems: "center",
    backgroundColor: tokens.brand.primary,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    transform: [{ rotate: "-8deg" }],
    width: 44,
  },
  markText: {
    color: tokens.brand.onPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: tokens.text.primary,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: tokens.text.tertiary,
    fontSize: 11,
    marginTop: 2,
  },
  badge: {
    backgroundColor: tokens.surface.subtle,
    borderColor: tokens.brand.focus,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeText: {
    color: tokens.brand.primaryHover,
    fontSize: 12,
    fontWeight: "700",
  },
  search: {
    alignItems: "center",
    borderColor: tokens.surface.divider,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  searchGlyph: {
    color: tokens.brand.primary,
    fontSize: 22,
    fontWeight: "700",
  },
  searchText: {
    color: tokens.text.primary,
    fontSize: 13,
    fontWeight: "600",
  },
});
