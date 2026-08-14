/*
 * 按代码判断标的品种。
 *
 * 单独放在这里而不是留在取数模块里：自选行情表是客户端组件，
 * 从 *.server.ts 引一个函数会把整个取数模块（连同 fetch、超时、
 * 体积上限那些只有服务端用得着的东西）一起打进浏览器包。
 *
 * 分类只看代码本身，不猜。认不出来的一律归「其他」——
 * 把一个站内样本标的显示成 A 股，用户会以为它有真实行情。
 */

/** 沪深六位代码，带 sh/sz 前缀。 */
const SYMBOL_PATTERN = /^(sh|sz)\d{6}$/u;

export type SymbolCategory = "fund" | "index" | "other" | "stock";

export const classifySymbol = (symbol: string): SymbolCategory => {
  if (!SYMBOL_PATTERN.test(symbol)) return "other";
  const market = symbol.slice(0, 2);
  const code = symbol.slice(2);

  if (market === "sh") {
    // 上证指数 000001、沪深 300 的 000300 等都是 000 开头。
    if (code.startsWith("000")) return "index";
    // 51/56/58 是沪市 ETF 与科创板 ETF 的号段。
    if (/^(51|56|58)/u.test(code)) return "fund";
    // 60 主板、68 科创板。
    if (code.startsWith("6")) return "stock";
    return "other";
  }

  // 深证成指 399001、创业板指 399006。
  if (code.startsWith("399")) return "index";
  // 15 是深市 ETF，16 是 LOF。
  if (code.startsWith("15") || code.startsWith("16")) return "fund";
  // 000/001/002/003 主板中小板、300/301 创业板。
  if (code.startsWith("00") || code.startsWith("30")) return "stock";
  return "other";
};
