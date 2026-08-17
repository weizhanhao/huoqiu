import { describe, expect, it } from "vitest";

import {
  isEtfPost,
  isFundPost,
  isPrivateFundPost,
  referencedCodes,
  type ChannelIndex,
} from "../../src/social/post-channel";

/*
 * 频道归类。
 *
 * 这段错了不会报错，只会让「基金」频道里混进一条讲白酒的帖子——而每条单看都
 * 正常，没人查得出来是哪一步判错的。所以守的是「凭什么算它属于这一档」。
 */

const index: ChannelIndex = {
  etfCodes: new Set(["513850", "510300"]),
  fundCodes: new Set(["110011"]),
  fundNames: ["易方达中小盘混合"],
  privateNames: ["景林资产", "高毅资产"],
};

describe("referenced codes", () => {
  it("takes the code out of a cashtag and drops the market prefix", () => {
    expect([...referencedCodes("看好 $美国50ETF(SH513850)$ 这只")]).toEqual([
      "513850",
    ]);
  });

  it("ignores a bare six-digit number that is not a real reference", () => {
    /*
     * 正文里的数字太多了：日期、金额、成交量。把裸数字也当代码，「513850」
     * 这样的字样一出现就归类，分出来的东西没法看。
     */
    expect([...referencedCodes("成交 513850 手")]).toEqual([]);
  });
});

describe("channel classification", () => {
  it("puts a post in the ETF channel only when the code is really an ETF", () => {
    expect(isEtfPost("加了点 $沪深300ETF(SH510300)$", index)).toBe(true);
    expect(isEtfPost("加了点 $贵州茅台(SH600519)$", index)).toBe(false);
  });

  it("finds an off-exchange fund by code or by name in plain text", () => {
    /*
     * 场外基金没有站内标的页，引用不成 $…$。只认 $…$ 的话，基金频道里几乎
     * 什么都不会有——而讨论基金的帖子明明在那儿。
     */
    expect(isFundPost("110011 今年跑赢了指数", index)).toBe(true);
    expect(isFundPost("易方达中小盘混合还拿着", index)).toBe(true);
    expect(isFundPost("聊聊白酒", index)).toBe(false);
  });

  it("puts a post in the private fund channel by manager name", () => {
    expect(isPrivateFundPost("景林资产的季报出了", index)).toBe(true);
    expect(isPrivateFundPost("聊聊白酒", index)).toBe(false);
  });

  it("does not let a one-character name match everything", () => {
    /*
     * 名单里偶尔有极短的名称。拿一个字去 includes 整篇正文，几乎每篇都会命中，
     * 这个频道就等于没筛——而它看起来还很热闹。
     */
    const short: ChannelIndex = {
      etfCodes: new Set(),
      fundCodes: new Set(),
      fundNames: [],
      privateNames: ["林"],
    };

    expect(isPrivateFundPost("林岸今天写了点东西", short)).toBe(false);
  });
});
