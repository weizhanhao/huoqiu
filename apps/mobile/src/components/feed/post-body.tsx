import {
  parsePostBody,
  type MentionAccount,
} from "@huoqiu/domain/social/post-body";
import { tokens } from "@huoqiu/native-ui";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { apiUrl } from "../../api/config";

/*
 * 帖子正文。
 *
 * 正文在库里是一个纯字符串，股票、话题、@ 和图片都以文本记号存在里面。解析
 * 用的是共享包里那一份（和网页版同源），这里只负责用 RN 的方式画出来。
 *
 * 股票引用是可点的：点名字跳 K 线，旁边一个「加自选」直接加。这两件事是人
 * 看到一支股票时最想做的——只渲染成蓝字却点不动，等于印了个假链接。
 */

export type PostBodyProperties = Readonly<{
  accounts: readonly MentionAccount[];
  body: string;
  onAddToWatchlist: (symbol: string, label: string) => void;
  onOpenInstrument: (symbol: string) => void;
  topics: readonly string[];
}>;

/* href 形如 /instruments/sh600519，末段就是代码。 */
const symbolOf = (href: string): string => href.split("/").pop() ?? "";

export function PostBody({
  accounts,
  body,
  onAddToWatchlist,
  onOpenInstrument,
  topics,
}: PostBodyProperties) {
  const segments = parsePostBody(body, { accounts, topics });
  const cashtags = segments.filter((segment) => segment.kind === "cashtag");
  const images = segments.filter((segment) => segment.kind === "image");

  return (
    <View style={styles.root} testID="post-body">
      <Text style={styles.paragraph}>
        {segments.map((segment, index) => {
          const key = `${String(index)}-${segment.kind}`;
          if (segment.kind === "text") {
            return (
              <Text key={key} style={styles.text}>
                {segment.text}
              </Text>
            );
          }
          if (segment.kind === "image") {
            /*
             * 图片不画在正文流里：RN 的 <Text> 里塞不进 <Image>，硬塞会让
             * 整段不渲染。它们另起一块列在下面。
             */
            return null;
          }
          if (segment.kind === "cashtag") {
            return (
              <Text
                key={key}
                onPress={() => {
                  onOpenInstrument(symbolOf(segment.href));
                }}
                style={styles.cashtag}
              >
                {segment.text}
              </Text>
            );
          }
          return (
            <Text key={key} style={styles.link}>
              {segment.text}
            </Text>
          );
        })}
      </Text>

      {/*
        股票引用再单独列一排可操作的条：正文里的蓝字只能跳转，而「加自选」
        需要够大的点击目标——挤在句子中间既点不准，也看不出它能点。
      */}
      {cashtags.map((segment, index) => {
        if (segment.kind !== "cashtag") return null;
        const symbol = symbolOf(segment.href);
        const label = segment.text.replaceAll("$", "");
        return (
          <View key={`${symbol}-${String(index)}`} style={styles.quote}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onOpenInstrument(symbol);
              }}
              style={styles.quoteMain}
            >
              <Text style={styles.quoteMark}>$</Text>
              <Text numberOfLines={1} style={styles.quoteName}>
                {label}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onAddToWatchlist(symbol, label);
              }}
              style={styles.quoteAdd}
            >
              <Text style={styles.quoteAddText}>加自选</Text>
            </Pressable>
          </View>
        );
      })}

      {images.map((segment, index) => {
        if (segment.kind !== "image") return null;
        return (
          <Text key={`image-${String(index)}`} style={styles.imageNote}>
            [图片] {apiUrl(segment.src)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cashtag: {
    color: tokens.text.link,
    fontWeight: "600",
  },
  imageNote: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
  },
  link: {
    color: tokens.text.link,
  },
  paragraph: {
    color: tokens.text.secondary,
    fontSize: 15,
    lineHeight: 24,
  },
  quote: {
    alignItems: "center",
    backgroundColor: tokens.surface.canvas,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  quoteAdd: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 4,
  },
  quoteAddText: {
    color: tokens.brand.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  quoteMain: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 34,
  },
  quoteMark: {
    color: tokens.market.warningText,
    fontSize: 14,
    fontWeight: "700",
  },
  quoteName: {
    color: tokens.text.primary,
    flex: 1,
    fontSize: 14,
  },
  root: {
    gap: 8,
  },
  text: {
    color: tokens.text.secondary,
  },
});
