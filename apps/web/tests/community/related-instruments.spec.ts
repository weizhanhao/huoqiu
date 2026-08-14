import { describe, expect, it } from "vitest";

import { relatedInstrumentsByPost } from "../../src/features/community/community-longform";
import { classifySymbol } from "../../src/lib/symbol-category";

/*
 * 帖子详情页的「相关标的」。
 *
 * 这一栏此前列的是「星海智造 HQ001」「火球宽基 HQ050」「稳健配置 HQ-F01」
 * ——三只编出来的证券，名字和代码都像真的，而且挂在一个财经站的
 * 「相关标的」标题底下，旁边没有任何说明。
 *
 * 更糟的是「星海智造」本身：那是早前从全站删掉的虚构标的之一。搜它搜不到，
 * 站内也没有它的页面——这一栏于是成了一条指向已删除实体的悬空引用。
 *
 * 社区帖子的正文是本站自己的内容，这没问题；但它引用的标的必须是真的，
 * 而且要能点进去。
 */

describe("every related instrument is a real, reachable one", () => {
  it("names no invented securities", () => {
    const all = Object.values(relatedInstrumentsByPost).flat();

    expect(all.length).toBeGreaterThan(0);
    for (const item of all) {
      // HQ／SYN／DEMO 那套代码都是本站自己编的；真实 A 股代码是六位数字。
      expect(item.symbol, item.symbol).toMatch(/^(?:sh|sz)\d{6}$/u);
      expect(item.name, item.name).not.toContain("样本");
      expect(item.name, item.name).not.toContain("演示");
    }
  });

  it("uses only codes this site can actually render", () => {
    for (const item of Object.values(relatedInstrumentsByPost).flat()) {
      /*
       * 站内认不出来的代码（北交所、三板）没有详情页。列在这里就是
       * 先许诺点得进去、再给一张 404。
       */
      expect(classifySymbol(item.symbol), item.symbol).not.toBe("other");
    }
  });
});
