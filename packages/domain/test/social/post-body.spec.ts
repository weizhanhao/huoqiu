import { describe, expect, it } from "vitest";

import { extractTopics, plainPostText } from "../../src/social/post-body";

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

/*
 * 摘要用的纯文本。
 *
 * 列表里的摘要此前直接印正文原文，于是读者看到的是
 * 「$贵州茅台(SH600519)$ 今天收 1293.09 #指数投资#」——那是存储格式，不是
 * 给人读的。摘要又不适合渲染成可点的富文本：整行本来就是「打开详情」，
 * 里面再套链接会把点击抢走。
 */
describe("plain post text", () => {
  it("keeps the stock name and drops the marker", () => {
    expect(plainPostText("看好 $贵州茅台(SH600519)$ 这一段")).toBe(
      "看好 贵州茅台 这一段",
    );
  });

  it("keeps the tag and drops the hashes", () => {
    expect(plainPostText("记一笔 #指数投资# 完")).toBe("记一笔 指数投资 完");
  });

  it("drops an image entirely", () => {
    /* 摘要里放不下图，留一串上传路径只是噪音。 */
    expect(plainPostText("配图在此 ![](/api/social/uploads/a.jpg) 就这样")).toBe(
      "配图在此 就这样",
    );
  });

  it("keeps an @mention readable as written", () => {
    expect(plainPostText("问问 @林岸 怎么看")).toBe("问问 @林岸 怎么看");
  });

  it("collapses the blank space the markers leave behind", () => {
    /* 去掉记号后常剩下连续空行，摘要里那些只是空洞。 */
    expect(plainPostText("第一段\n\n\n第二段")).toBe("第一段 第二段");
  });
});
