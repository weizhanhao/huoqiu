import { classifySymbol } from "./symbol-category";

/*
 * 这个代码站内开得出页面吗。
 *
 * 自选此前用的判据是「在不在本地 K 线快照里」——那份快照只有 8 条，而且住在
 * .runtime/ 下、不随代码提交。于是：本机只有那 8 只加得进去，装到服务器上
 * 快照根本不存在，**每一只股票的加自选都点不动**，还不报错、不提示。
 *
 * 真正的判据是「上游能不能报价」：个股页现在按需现取，沪深、港股、美股都开得
 * 出来。所以这里看代码形状，不查运行时文件。
 *
 * 形状与 search.server.ts 的 symbolOfQuoteId 保持一致——那是全站生成代码的
 * 唯一出口，两边对不上就会出现「搜得到但加不进」。
 */

/** 港股：hk + 五位数字。 */
const HK_PATTERN = /^hk\d{5}$/u;

/*
 * 美股：us + 代码。站内地址不区分交易所（纳斯达克、纽交所、美交所都是 us），
 * 交易所是打开页面时现问的。
 */
const US_PATTERN = /^us[a-z][a-z0-9_]{0,9}$/u;

export const isWatchableSymbol = (symbol: string): boolean => {
  if (HK_PATTERN.test(symbol) || US_PATTERN.test(symbol)) return true;
  /*
   * 沪深以 classifySymbol 为准：它是全站唯一那份号段表。北交所（920xxx）与
   * 新三板（835xxx）落在「其他」里——它们站内渲染不出来，加进自选就是一行
   * 永远取不到价的空记录。
   */
  return classifySymbol(symbol) !== "other";
};
