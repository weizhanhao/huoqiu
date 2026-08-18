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

/**
 * 手指按在图上第几根柱子。
 *
 * 边缘要夹住：手指划出图外时 locationX 会是负数或大于宽度，不夹的话读到的是
 * 一个不存在的下标，十字线跳到别处、读数变成一片空白——而这恰恰发生在用户
 * 想看第一根或最后一根的时候，因为那时手指就在边上。
 *
 * 宽度为 0（布局还没量到）时一律回 0，不要除出 NaN。
 */
export const barIndexAt = (x: number, width: number, count: number): number => {
  if (count <= 0) return 0;
  if (!Number.isFinite(x) || width <= 0) return 0;
  const index = Math.floor((x / width) * count);
  return Math.min(Math.max(index, 0), count - 1);
};
