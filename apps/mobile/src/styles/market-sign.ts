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

/*
 * 取不到值时用 —，不是 0。
 *
 * 上游对停牌、新基未披露净值、场外品种给的是空值。把空当 0 处理，页面上会
 * 印出一个「0.00%」——那读起来是「今天没动」，而事实是「不知道」。两者会被
 * 放进同一份榜单排名次。
 *
 * 这几个函数收 number | null，是因为服务端的 HotRow / EtfRow / FundRow 本来
 * 就是可空的，而移动端一度把它们声明成非空——.toFixed() 撞上 null 会直接
 * 红屏，而那一天恰好是某只票停牌。
 */
export const MISSING = "—";

/*
 * 红涨绿跌是 A 股默认，但用户可以在设置里换成绿涨红跌。
 *
 * 别直接调这个函数——调 useSignColor()，它会把当前账号选的那档带进来。
 * 直接调等于永远按默认档上色，而那正是「设置里改了但界面不变」的来源。
 */
export const signColorFor = (
  mode: "green-up" | "red-up",
  changePercent: number | null,
): string => {
  if (changePercent === null || changePercent === 0) {
    return tokens.text.secondary;
  }
  const rising = changePercent > 0;
  const useUpColor = mode === "red-up" ? rising : !rising;
  return useUpColor ? tokens.market.upText : tokens.market.downText;
};

/*
 * 涨的时候要带 +。
 *
 * 只靠颜色区分方向，色觉障碍的人看到的是两个一样的数字，截图转灰度之后
 * 谁也分不出来。符号是那份冗余。
 */
export const signedPercent = (changePercent: number | null): string =>
  changePercent === null
    ? MISSING
    : `${changePercent > 0 ? "+" : ""}${changePercent.toFixed(2)}%`;

export const signedAmount = (changeAmount: number | null): string =>
  changeAmount === null
    ? MISSING
    : `${changeAmount > 0 ? "+" : ""}${changeAmount.toFixed(2)}`;

/** 价格一类的纯数字。位数由调用方定：净值四位，股价两位。 */
export const fixedOrMissing = (
  value: number | null | undefined,
  digits: number,
): string => (value === null || value === undefined ? MISSING : value.toFixed(digits));
