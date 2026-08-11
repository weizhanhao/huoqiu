import { tokens } from "@huoqiu/native-ui";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type {
  ProfileDestination,
  SyntheticProfile,
} from "../../features/five-tab/synthetic-fixture";
import { appTouchMinimum } from "../../styles/app-touch";
import { ScreenHeader } from "../d0/screen-header";

type ProfileHubProperties = Readonly<{
  profile: SyntheticProfile;
  onNavigate: (destination: ProfileDestination) => void;
}>;

const entryGlyphs: Readonly<Record<ProfileDestination, string>> = {
  messages: "◎",
  portfolios: "◇",
  settings: "⚙",
  watchlist: "☆",
};

export function ProfileHub({ profile, onNavigate }: ProfileHubProperties) {
  return (
    <View style={styles.viewport}>
      <ScreenHeader subtitle="合成身份 · 本地演示" title="我的" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View
            accessibilityLabel="合成头像"
            accessibilityRole="image"
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>17</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.alias}>{profile.alias}</Text>
            <Text style={styles.profileId}>{profile.id}</Text>
            <Text style={styles.bio}>{profile.bio}</Text>
          </View>
        </View>

        <View style={styles.sessionCard}>
          <View style={styles.sessionTopline}>
            <Text style={styles.sessionTitle}>会话与合成披露</Text>
            <Text style={styles.sessionBadge}>SESSION</Text>
          </View>
          <Text style={styles.sessionCopy}>{profile.sessionDisclosure}</Text>
          <Text style={styles.sessionSource}>{profile.source}</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>常用入口</Text>
          <Text style={styles.sectionSubtitle}>全部连接到真实本地页面</Text>
          <View style={styles.entryList}>
            {profile.entries.map((entry) => (
              <Pressable
                accessibilityLabel={`打开${entry.label}`}
                accessibilityRole="button"
                key={entry.destination}
                onPress={() => onNavigate(entry.destination)}
                style={styles.entry}
              >
                <View style={styles.entryGlyph}>
                  <Text aria-hidden style={styles.entryGlyphText}>
                    {entryGlyphs[entry.destination]}
                  </Text>
                </View>
                <View style={styles.entryIdentity}>
                  <Text style={styles.entryLabel}>{entry.label}</Text>
                  <Text style={styles.entryMeta}>{entry.meta}</Text>
                </View>
                <Text aria-hidden style={styles.chevron}>
                  ›
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>账户与持牌能力</Text>
          <Text style={styles.sectionSubtitle}>
            当前版本不接入真实账户或真实交易
          </Text>
          <View style={styles.unavailableList}>
            {profile.unavailableCapabilities.map((capability) => (
              <View key={capability} style={styles.unavailableRow}>
                <Text style={styles.unavailableLabel}>{capability}</Text>
                <Text style={styles.unavailableBadge}>UNAVAILABLE</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.disclosure}>
          合成身份不包含真实 PII；所有数据仅供产品预览
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
  hero: {
    alignItems: "center",
    backgroundColor: tokens.surface.inverse,
    borderRadius: 20,
    flexDirection: "row",
    gap: 16,
    padding: 22,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: tokens.brand.primary,
    borderColor: tokens.brand.secondary,
    borderRadius: 34,
    borderWidth: 2,
    height: 68,
    justifyContent: "center",
    width: 68,
  },
  avatarText: {
    color: tokens.brand.onPrimary,
    fontSize: 22,
    fontWeight: "700",
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  alias: {
    color: tokens.text.inverse,
    fontSize: 21,
    fontWeight: "700",
  },
  profileId: {
    color: tokens.text.inverseMuted,
    fontSize: 10,
    paddingTop: 4,
  },
  bio: {
    color: tokens.text.inverseMuted,
    fontSize: 12,
    lineHeight: 19,
    paddingTop: 9,
  },
  sessionCard: {
    backgroundColor: tokens.surface.subtle,
    borderColor: tokens.brand.focus,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  sessionTopline: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sessionTitle: {
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  sessionBadge: {
    color: tokens.brand.primaryHover,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
  },
  sessionCopy: {
    color: tokens.text.secondary,
    fontSize: 13,
    lineHeight: 21,
    paddingTop: 12,
  },
  sessionSource: {
    color: tokens.text.tertiary,
    fontSize: 9,
    paddingTop: 10,
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
  entryList: {
    paddingTop: 12,
  },
  entry: {
    alignItems: "center",
    borderTopColor: tokens.surface.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: appTouchMinimum,
    paddingVertical: 12,
  },
  entryGlyph: {
    alignItems: "center",
    backgroundColor: tokens.surface.subtle,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  entryGlyphText: {
    color: tokens.brand.primaryHover,
    fontSize: 18,
    fontWeight: "700",
  },
  entryIdentity: {
    flex: 1,
  },
  entryLabel: {
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  entryMeta: {
    color: tokens.text.tertiary,
    fontSize: 10,
    paddingTop: 4,
  },
  chevron: {
    color: tokens.text.tertiary,
    fontSize: 26,
  },
  unavailableList: {
    paddingTop: 12,
  },
  unavailableRow: {
    alignItems: "center",
    borderTopColor: tokens.surface.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 56,
  },
  unavailableLabel: {
    color: tokens.text.secondary,
    flex: 1,
    fontSize: 13,
  },
  unavailableBadge: {
    color: tokens.market.warningText,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  disclosure: {
    color: tokens.market.warningText,
    fontSize: 11,
    lineHeight: 18,
    textAlign: "center",
  },
});
