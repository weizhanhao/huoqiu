import { notFound, permanentRedirect } from "next/navigation";

import { classifySymbol } from "../../../lib/symbol-category";

/*
 * ETF 详情。
 *
 * 这条路由此前渲染的是九只虚构 ETF（etf_syn_0001…），趋势、规模、持仓全是
 * 编的；而真实 ETF 的行情、日线和盘口站内早就有了，只是在 /instruments 下。
 *
 * 两套详情页没有必要。ETF 就是场内交易的标的，用的是同一套行情机制，
 * 所以这条路由现在只做一件事：把真实代码送到标的页去。
 *
 * 站内渲染不出来的代码就是 404——不是「详情暂未开放」，
 * 后者会让人以为这只 ETF 站里有、只是还没做完。
 */

type EtfDetailPageProperties = Readonly<{
  params: Promise<Readonly<{ etfId: string }>>;
}>;

/*
 * 六位代码补出市场前缀。
 *
 * 51/56/58 是沪市 ETF 与科创板 ETF 的号段，15/16 是深市 ETF 与 LOF。
 * 判断本身交给 classifySymbol——它是全站唯一那份号段表，
 * 在这里再抄一遍迟早会和它漂移。
 */
const symbolOf = (code: string): string | null => {
  if (!/^\d{6}$/u.test(code)) return null;
  for (const candidate of [`sh${code}`, `sz${code}`]) {
    if (classifySymbol(candidate) === "fund") return candidate;
  }
  return null;
};

export default async function EtfDetailPage({
  params,
}: EtfDetailPageProperties) {
  const { etfId } = await params;

  const symbol = symbolOf(etfId);
  if (symbol === null) notFound();

  permanentRedirect(`/instruments/${symbol}`);
}
