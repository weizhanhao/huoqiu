import { tokens } from "@huoqiu/native-ui";

/*
 * 涨跌的颜色和符号。
 *
 * 红涨绿跌是 A 股语义，和欧美相反——这条规则只写一遍。各页签各写一份的话，
 * 迟早有一处写反，而写反的那一处不会报错，只会让人看错方向。
 *
 * 用 *Text 变体：tokens.market.up / down 是给图表填充和描边的原色，放在浅底上
 * 做文字达不到对比度要求。
 */

export const signColor = (changePercent: number): string => {
  if (changePercent > 0) return tokens.market.upText;
  if (changePercent < 0) return tokens.market.downText;
  return tokens.text.secondary;
};

/*
 * 涨的时候要带 +。
 *
 * 只靠颜色区分方向，色觉障碍的人看到的是两个一样的数字，截图转灰度之后
 * 谁也分不出来。符号是那份冗余。
 */
export const signedPercent = (changePercent: number): string =>
  `${changePercent > 0 ? "+" : ""}${changePercent.toFixed(2)}%`;

export const signedAmount = (changeAmount: number): string =>
  `${changeAmount > 0 ? "+" : ""}${changeAmount.toFixed(2)}`;
