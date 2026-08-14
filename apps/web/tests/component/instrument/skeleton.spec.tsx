import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SectionLoading from "../../../src/app/instruments/[listingId]/[section]/loading";
import { StockRailSkeleton } from "../../../src/components/instrument/skeleton";

/*
 * 骨架。
 *
 * 实机上很难看到它：Next 会预取视口内的链接，分区导航整列都可见、
 * 于是全被预取，切换是瞬时的。那是更好的结果，但也意味着骨架只在
 * 慢网络或冷缓存时才登场——正因为平时看不见，才更需要用例守着，
 * 否则它坏掉也没人知道。
 */

describe("the loading skeletons", () => {
  it("gives the section page a card-shaped placeholder", () => {
    const html = renderToStaticMarkup(<SectionLoading />);

    // 有骨架条，而不是一句「加载中」——后者高度和真实内容差太远。
    expect(html).toContain("<span");
    expect(html).toMatch(/class="[^"]*card/u);
  });

  it("hides the rail skeleton from screen readers", () => {
    /*
     * 骨架是纯视觉占位，没有任何信息。读屏念出一串空条只会让人困惑，
     * 而它下一秒就被真内容替换掉了。
     */
    const html = renderToStaticMarkup(<StockRailSkeleton />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("<span");
  });

  it("keeps the rail skeleton shorter than the real rail", () => {
    /*
     * 宁可矮，不可高。CLS 只算已渲染元素的位移：骨架矮了，真内容到达后
     * 容器往下长，下面是页面底部，没有元素被推动；骨架高了则内容到达时
     * 收缩，下方全部上跳，那才是实打实的位移。
     *
     * 真实右栏是三张卡（简介八行 + 相关股票六行 + 相关基金六行），
     * 骨架只给两张、每张三行。
     */
    const html = renderToStaticMarkup(<StockRailSkeleton />);
    const cards = html.match(/class="[^"]*card/gu) ?? [];

    expect(cards.length).toBeLessThan(3);
  });
});
