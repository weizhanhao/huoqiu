/*
 * 把一组价格映射成 0~1 的高度。
 *
 * 单独一个文件，是因为「最高等于最低时怎么办」这条判断分时图、K 线和迷你
 * 走势图都要用，而漏掉它的表现是整段样式算成 NaN：图不显示，控制台一声不吭。
 * 各写一遍，迟早有一处漏。
 */

export type Bounds = Readonly<{ high: number; low: number }>;

export const boundsOf = (values: readonly number[]): Bounds => {
  const high = Math.max(...values);
  const low = Math.min(...values);
  /* 全平的一段（停牌、一字板）会让 high-low 为 0，除法就成了 NaN。 */
  return high === low ? { high: high + 1, low: low - 1 } : { high, low };
};

export const ratio = ({ high, low }: Bounds, value: number): number =>
  (value - low) / (high - low);
