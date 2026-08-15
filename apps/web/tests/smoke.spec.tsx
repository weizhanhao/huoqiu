import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RootLayout, { metadata } from "../src/app/layout";
import NewsPage from "../src/app/news/page";
import HomePage from "../src/app/page";
import { DesktopShell } from "../src/components/shell/desktop-shell";

const forbiddenProductLanguage = ["雪球", "开户", "认购", "交易下单"];

const renderShell = async (): Promise<string> =>
  renderToStaticMarkup(<RootLayout>{HomePage()}</RootLayout>);

describe("web shell", () => {
  it("keeps the brand out of the page heading", async () => {
    const markup = await renderShell();

    /*
     * 站名不是页面标题。这里原本断言的正好相反——品牌占着 h1，
     * 于是全站二十多条路由的唯一 h1 都是「火球」：靠标题导航的人
     * 来回跳，听到的永远是同一个词，完全不知道自己在哪一页。
     */
    expect(markup).toContain('class="brand-word">火球');
    expect(markup).not.toMatch(/<h1\b[^>]*>火球<\/h1>/u);
    /*
     * 这一页自己的标题要在。根路径现在是关注流——站内不再有一个叫「首页」的
     * 页面，进站第一眼就是自己关注的人。
     */
    expect(markup).toMatch(/<h1\b[^>]*>关注<\/h1>/u);
    expect(metadata.title).toBe("火球");
  });

  it("separates real-source finance from synthetic community content", async () => {
    /*
     * 真实来源与社区内容的分隔线从「首页上下两块」搬到了「两条路由」：
     * /news 是公开来源的财经记录，/ 是关注的人写的东西。这条用例跟着搬，
     * 守的东西没变——真实来源区必须存在、无快照时如实说明、任何情况下
     * 都不能拿合成财经内容顶替它。
     *
     * 快照目录显式指向一个不存在的路径，确定性地覆盖「无快照」分支：
     * 直接断言「暂时没有资讯」等于把「快照不存在」当成产品的固定状态，
     * 真跑了采集脚本之后反而会失败，而失败的原因恰恰是功能做成了。
     */
    const original = process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY;
    process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY =
      "/nonexistent/huoqiu-smoke-no-snapshot";
    let markup: string;
    try {
      markup = renderToStaticMarkup(
        <RootLayout>
          {await NewsPage({ searchParams: Promise.resolve({}) })}
        </RootLayout>,
      );
    } finally {
      if (original === undefined) {
        delete process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY;
      } else {
        process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY = original;
      }
    }

    expect(markup).toContain("暂时没有资讯");
    /*
     * 环境标识收敛成了「预览环境」。「本地受保护」描述的是部署配置，
     * 而它出现在顶栏最显眼的位置、每一页都在——读者只需要知道这不是正式环境。
     */
    expect(markup).toContain("预览环境");
    expect(markup).not.toContain("当前使用演示数据和合成数据");
    expect(markup).not.toContain("星海智造完成日内数据更新");
  });

  it("keeps the follow stream free of anything but followed people", async () => {
    /*
     * 「这个关注只显示关注人发的内容」——原来这一页顶着编辑部栏目卡、
     * 夹具信息流和财经区块，唯独没有关注的人写了什么。
     */
    const markup = await renderShell();

    expect(markup).toContain("后这里会显示你关注的人发的内容");
    for (const removed of [
      "监管披露与宏观数据",
      "社区内容",
      "合成市场的第一份观察",
    ]) {
      expect(markup).not.toContain(removed);
    }
  });

  it("keeps fixture-independent content visible when the D0 fixture fails", () => {
    const markup = renderToStaticMarkup(
      <DesktopShell
        fixtureResult={{ status: "error", message: "Fixture failure" }}
        requiresD0Fixture={false}
      >
        <section>真实来源仍然可用</section>
      </DesktopShell>,
    );

    expect(markup).toContain("真实来源仍然可用");
    expect(markup).not.toContain("Fixture failure");
  });

  it.each(forbiddenProductLanguage)("does not expose %s", async (language) => {
    expect(await renderShell()).not.toContain(language);
  });
});
