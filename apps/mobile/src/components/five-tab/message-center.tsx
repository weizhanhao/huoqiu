import { tokens } from "@huoqiu/native-ui";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { SyntheticMessage } from "../../features/five-tab/synthetic-fixture";
import { ScreenHeader } from "../d0/screen-header";

type MessageCenterProperties = Readonly<{
  messages: readonly SyntheticMessage[];
  onBack: () => void;
}>;

export function MessageCenter({ messages, onBack }: MessageCenterProperties) {
  return (
    <View style={styles.viewport}>
      <ScreenHeader
        onBack={onBack}
        subtitle={`${messages.length} 条固定合成消息`}
        title="消息"
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.disclosureCard}>
          <Text style={styles.disclosureTitle}>会话消息中心</Text>
          <Text style={styles.disclosureCopy}>
            仅本次预览，不跨设备同步；没有推送、外部请求或真实用户数据。
          </Text>
        </View>
        <View style={styles.list}>
          {messages.map((message) => (
            <View key={message.id} style={styles.messageCard}>
              <View style={styles.messageTopline}>
                <Text style={styles.kind}>{message.kind}</Text>
                <Text style={styles.at}>{message.at}</Text>
              </View>
              <Text style={styles.title}>{message.title}</Text>
              <Text style={styles.body}>{message.body}</Text>
              <Text style={styles.source}>{message.source}</Text>
            </View>
          ))}
        </View>
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
  disclosureCard: {
    backgroundColor: tokens.surface.subtle,
    borderColor: tokens.brand.focus,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  disclosureTitle: {
    color: tokens.text.primary,
    fontSize: 17,
    fontWeight: "700",
  },
  disclosureCopy: {
    color: tokens.text.secondary,
    fontSize: 12,
    lineHeight: 20,
    paddingTop: 8,
  },
  list: {
    gap: 10,
  },
  messageCard: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  messageTopline: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  kind: {
    backgroundColor: tokens.surface.subtle,
    borderRadius: 11,
    color: tokens.brand.primaryHover,
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  at: {
    color: tokens.text.tertiary,
    fontSize: 9,
  },
  title: {
    color: tokens.text.primary,
    fontSize: 17,
    fontWeight: "700",
    paddingTop: 14,
  },
  body: {
    color: tokens.text.secondary,
    fontSize: 13,
    lineHeight: 21,
    paddingTop: 7,
  },
  source: {
    color: tokens.text.tertiary,
    fontSize: 9,
    paddingTop: 12,
  },
});
