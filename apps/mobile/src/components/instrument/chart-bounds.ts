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
/**
 * 移动平均。窗口不满的位置为 null——那不是 0，也不该被画出来。
 *
 * 前几根算不出 MA20 是事实：它需要二十根。补个 0 的话，线会从图的最底下
 * 拔地而起，看图的人会以为那一段真的跌到过零。
 *
 * 要在**全量**上算，再截显示的那一段：只拿屏幕上这 120 根算，第 1 根的
 * MA20 永远是空的，而它明明有历史可用。
 */
export const movingAverage = (
  values: readonly number[],
  window: number,
): readonly (number | null)[] => {
  if (window <= 0) return values.map(() => null);
  const out: (number | null)[] = [];
  let sum = 0;
  for (const [index, value] of values.entries()) {
    sum += value;
    if (index >= window) sum -= values[index - window] ?? 0;
    out.push(index >= window - 1 ? sum / window : null);
  }
  return out;
};

export const barIndexAt = (x: number, width: number, count: number): number => {
  if (count <= 0) return 0;
  if (!Number.isFinite(x) || width <= 0) return 0;
  const index = Math.floor((x / width) * count);
  return Math.min(Math.max(index, 0), count - 1);
};
