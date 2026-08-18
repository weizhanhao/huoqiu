import {
  parsePostBody,
  type MentionAccount,
} from "@huoqiu/domain/social/post-body";
import { tokens } from "@huoqiu/native-ui";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { apiUrl } from "../../api/config";
import { appTouchMinimum } from "../../styles/app-touch";

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
  onOpenTopic: (tag: string) => void;
  onOpenUser: (accountId: string) => void;
  topics: readonly string[];
}>;

/* href 形如 /instruments/sh600519，末段就是代码。 */
const symbolOf = (href: string): string => href.split("/").pop() ?? "";

/* 话题的 href 是 /topics/<编码过的标签>，@某人 的是 /users/<id>。 */
const lastSegment = (href: string): string =>
  decodeURIComponent(href.split("/").pop() ?? "");

export function PostBody({
  accounts,
  body,
  onAddToWatchlist,
  onOpenInstrument,
  onOpenTopic,
  onOpenUser,
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
                accessibilityRole="link"
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
          /*
           * 话题和 @某人 也要真能点。
           *
           * 这两种此前只染成链接色，没有 onPress——蓝字、点不动。那比不染色
           * 更糟：蓝色本身就是「这里能点」的承诺，染了又点不动，用户会以为
           * 是自己没点准，于是再点几次。
           *
           * 解析层已经替我们做过判断：话题不在已知列表里、@ 的名字重名或不
           * 存在时，回来的是普通 text 段，走不到这里。所以这里拿到的一定是
           * 点得开的。
           */
          if (segment.kind === "topic") {
            return (
              <Text
                accessibilityRole="link"
                key={key}
                onPress={() => {
                  onOpenTopic(lastSegment(segment.href));
                }}
                style={styles.link}
              >
                {segment.text}
              </Text>
            );
          }
          return (
            <Text
              accessibilityRole="link"
              key={key}
              onPress={() => {
                onOpenUser(lastSegment(segment.href));
              }}
              style={styles.link}
            >
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

      {/*
        真把图画出来。
        
        这里此前印的是一行 [图片] http://172.29.98.11/api/...——选图、压缩、
        上传整条链路都通了，只差最后这一步，而读者看到的是一串内网地址。
        
        比例写 4:3 而不是等图回来再量：不定高的话，图片一到位整篇正文会往下
        跳一次，正在读的人会丢失位置。
      */}
      {images.map((segment, index) => {
        if (segment.kind !== "image") return null;
        return (
          <Image
            accessibilityLabel="帖子配图"
            key={`image-${String(index)}`}
            resizeMode="cover"
            source={{ uri: apiUrl(segment.src) }}
            style={styles.image}
          />
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
  image: {
    aspectRatio: 4 / 3,
    backgroundColor: tokens.surface.canvas,
    borderRadius: 8,
    width: "100%",
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
    minHeight: appTouchMinimum,
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
    minHeight: appTouchMinimum,
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
