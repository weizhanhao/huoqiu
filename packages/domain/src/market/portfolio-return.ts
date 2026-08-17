/*
 * 组合当日收益 = Σ(标的涨跌幅 × 权重)。
 *
 * 这段在网页版里存在三份（组合榜、我的组合、持仓表），手机端要用是第四份。
 * 三份写法一致纯属运气：其中任何一份把「取不到时返回 null」改成「当 0 处理」，
 * 同一个组合在两个页面上就会显示两个收益，而两个都印得理直气壮。
 *
 * 取不到就整体为 null，不是跳过那一只。跳过等于假设它今天没涨没跌，而它可能
 * 停牌、可能刚退市——把未知按 0 计入，算出来的数字看着精确，其实是编的。
 */

export type HoldingWeight = Readonly<{
  symbol: string;
  /** 百分数，例如 12.5 表示 12.5%。 */
  weight: number;
}>;

export const dayReturn = (
  holdings: readonly HoldingWeight[],
  changePercentBySymbol: ReadonlyMap<string, number | null>,
): number | null => {
  let total = 0;
  for (const holding of holdings) {
    const change = changePercentBySymbol.get(holding.symbol);
    if (change === undefined || change === null) return null;
    total += (change * holding.weight) / 100;
  }
  return total;
};
