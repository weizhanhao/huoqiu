import { tokens } from "@huoqiu/native-ui";

export const appTouchMinimum = Number.parseInt(tokens.touch.appMinimum, 10);

/*
 * 把一颗视觉上偏小的按钮的热区撑到最小触达。
 *
 * 参考图里有一批按钮天生就小：头部那三个 36 的圆钮、名字旁边那颗 32–36 的
 * 「关注」、发布栏上的胶囊。照着画出来是对的——把它们统统放大到 48，版面就散了。
 *
 * 但 36 点的热区在手上是「点了没反应，再点一次」，而第二次常常点到旁边那一行。
 * hitSlop 只扩热区、不动布局，正是为这种情形准备的：外观照旧，手指够得着。
 *
 * 传视觉尺寸，拿回四个方向各该外扩多少；已经够大的返回 0。
 */
export const touchSlop = (
  visualSize: number,
): Readonly<{ bottom: number; left: number; right: number; top: number }> => {
  /* 两边各分一半；除不尽时向上取整——宁可多一点，不要差一点。 */
  const slop = Math.max(0, Math.ceil((appTouchMinimum - visualSize) / 2));
  return { bottom: slop, left: slop, right: slop, top: slop };
};
