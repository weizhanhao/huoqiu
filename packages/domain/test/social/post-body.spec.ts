import { describe, expect, it } from "vitest";

import { extractTopics } from "../../src/social/post-body";

/*
 * 正文里写过哪些话题。
 *
 * 这一串会成为发帖器「#」面板里能选的东西，也就是说：它错了，用户会选中一个
 * 错的标签写进自己真实的帖子里。所以宁可少认，不能乱认。
 */

describe("extract topics", () => {
  it("finds each pair of hashes", () => {
    expect(extractTopics("聊聊 #复盘# 和 #仓位管理#")).toEqual([
      "复盘",
      "仓位管理",
    ]);
  });

  it("ignores a lone hash that never closes", () => {
    /*
     * 「#3 号线」这种写法在正文里很常见。把它当话题，面板里会冒出一堆半句话，
     * 而用户会以为那是别人建的话题。
     */
    expect(extractTopics("坐 #3 号线去")).toEqual([]);
  });

  it("does not let a topic span a line break", () => {
    expect(extractTopics("#上一行\n下一行#")).toEqual([]);
  });

  it("drops the padding but keeps the words inside", () => {
    expect(extractTopics("# 复盘 #")).toEqual(["复盘"]);
  });

  it("skips an empty pair", () => {
    expect(extractTopics("##")).toEqual([]);
    expect(extractTopics("#   #")).toEqual([]);
  });
});
