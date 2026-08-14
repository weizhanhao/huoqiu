import { describe, expect, it } from "vitest";

import EtfDetailPage from "../../src/app/etfs/[etfId]/page";

/*
 * ETF 详情。
 *
 * 这条路由此前渲染的是九只虚构 ETF（etf_syn_0001…），趋势、规模、持仓全是
 * 编的；而真实 ETF 的行情、日线和盘口站内早就有了，只是在 /instruments 下。
 *
 * 两套详情页没有必要——ETF 就是场内交易的标的，用的是同一套行情机制。
 * 这条路由现在只做一件事：把真实代码送到标的页去。
 *
 * 这一份守的是号段的归属。510300 是沪市 ETF、159919 是深市 ETF；
 * 前缀补错会把人送到另一只完全不同的标的上，而地址栏看起来一切正常。
 */

describe("ETF detail route", () => {
  /*
   * 重定向的目标在错误的 digest 上，不在 message 里。
   * 只断言「抛了 NEXT_REDIRECT」的话，送错标的也照样绿。
   */
  const redirectTargetOf = async (etfId: string): Promise<string> => {
    try {
      await EtfDetailPage({ params: Promise.resolve({ etfId }) });
    } catch (error: unknown) {
      const digest = (error as { digest?: unknown }).digest;
      return typeof digest === "string" ? digest : String(error);
    }
    throw new Error(`${etfId} 没有重定向`);
  };

  it("sends a real ETF code to the instrument page it belongs to", async () => {
    for (const [code, symbol] of [
      ["510300", "sh510300"],
      ["159919", "sz159919"],
      ["588000", "sh588000"],
    ] as const) {
      expect(await redirectTargetOf(code), code).toContain(
        `/instruments/${symbol}`,
      );
    }
  });

  it("404s the invented ETF identifiers and anything else", async () => {
    for (const etfId of ["etf_syn_0001", "600519", "abcdef", "12345"]) {
      /*
       * 600519 是股票不是 ETF，走这条路由属于用错了地址；
       * etf_syn_0001 是已经删掉的样本。两者都该是 404，
       * 而不是「详情暂未开放」——后者会让人以为过几天再来就有了。
       */
      await expect(
        EtfDetailPage({ params: Promise.resolve({ etfId }) }),
        etfId,
      ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/u);
    }
  });
});
