/*
 * 图表的列几何。
 *
 * 单独一个文件，因为主图与量能区必须共用同一套列宽——各算各的，蜡烛和量柱
 * 就会错开半列。那种错位看着「只是有点怪」，不报错，也不会有用例变红。
 */

/** 目标列间隙。 */
const SLOT_GAP = 2;

/*
 * 实体宽度上限。
 *
 * 这一条是给「年K 只有十几根」准备的：不封顶的话每根蜡烛会撑到二十多点宽，
 * 一屏十几个大色块，完全不是 K 线的样子。根数少时只让间隙变大，不让实体变胖。
 */
const BODY_MAX = 11;

/*
 * 低于这个宽度就画不出空心。
 *
 * 空心阳线靠 1pt 描边表达，实体只有 3pt 宽时左右两条边框吃掉三分之二，糊成
 * 一根实心条——「空心/实心」这层与颜色并行的冗余编码就失效了，而它恰恰是
 * 色觉障碍用户唯一能用的那一层。
 */
const HOLLOW_MIN = 4;

export type Geometry = Readonly<{
  /** 实体宽。 */
  bodyWidth: number;
  /** 这个宽度画不画得出空心。 */
  hollow: boolean;
  /** 每列宽度（含间隙）。 */
  slot: number;
  /** 第 index 根实体的左沿。 */
  xLeft: (index: number) => number;
  /** 第 index 根的中心线（影线与折线取样都用它）。 */
  xMid: (index: number) => number;
}>;

export const geometryOf = (plotWidth: number, count: number): Geometry => {
  const slot = plotWidth / Math.max(count, 1);
  const bodyWidth = Math.min(BODY_MAX, Math.max(1, slot - SLOT_GAP));
  return {
    bodyWidth,
    hollow: bodyWidth >= HOLLOW_MIN,
    slot,
    xLeft: (index) => index * slot + (slot - bodyWidth) / 2,
    xMid: (index) => index * slot + slot / 2,
  };
};

/*
 * 每个周期默认显示多少根。
 *
 * 60 不是审美偏好，是几何推出来的：空心阳线要求实体 ≥ 4pt，列宽就要 ≥ 6pt，
 * 而绘图区约 374pt——374 / 6 ≈ 62。超过这个数，阳线的空心就糊没了。
 *
 * 此前一律取 120，实体只剩 1.1pt，和影线一样宽，整张图退化成一排竖线。
 */
export const visibleBarsFor = (period: string): number => {
  if (period === "year") return 30;
  if (period === "quarter") return 40;
  return 60;
};

/**
 * 把一串值转成 SVG 折线的 d；不足两点成不了线，返回 null。
 *
 * null 值（均线窗口未满）把线**断开**——补 0 会让线从图底拔地而起，看图的人
 * 会以为那几天真的跌到过零。所以遇到 null 就起一段新的 M。
 */
export const linePath = (
  values: readonly (number | null)[],
  xOf: (index: number) => number,
  yOf: (value: number) => number,
): string | null => {
  let path = "";
  let penDown = false;
  let drawn = 0;
  for (const [index, value] of values.entries()) {
    if (value === null) {
      penDown = false;
      continue;
    }
    path += `${penDown ? "L" : "M"}${xOf(index).toFixed(2)} ${yOf(value).toFixed(2)}`;
    penDown = true;
    drawn += 1;
  }
  return drawn >= 2 ? path : null;
};

/**
 * 分时价格线下面那层填充：沿折线走一圈，再沿底边收口。
 *
 * 收口必须显式走底边而不是直接 Z——直接闭合会连出一条从末点回到首点的斜边，
 * 填充区域于是变成一个三角形，把图的下半部分整片染上颜色。
 */
export const areaPath = (
  values: readonly number[],
  xOf: (index: number) => number,
  yOf: (value: number) => number,
  baseline: number,
): string | null => {
  if (values.length < 2) return null;
  const line = linePath(values, xOf, yOf);
  if (line === null) return null;
  const lastX = xOf(values.length - 1).toFixed(2);
  const firstX = xOf(0).toFixed(2);
  return `${line}L${lastX} ${baseline.toFixed(2)}L${firstX} ${baseline.toFixed(2)}Z`;
};
