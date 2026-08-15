import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RootLayout, { metadata } from "../src/app/layout";
import HomePage from "../src/app/page";
import { DesktopShell } from "../src/components/shell/desktop-shell";

const forbiddenProductLanguage = ["雪球", "开户", "认购", "交易下单"];

const renderShell = async (): Promise<string> =>
  renderToStaticMarkup(
    <RootLayout>
      {await HomePage({ searchParams: Promise.resolve({}) })}
    </RootLayout>,
  );

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
    // 这一页自己的标题要在。
    expect(markup).toMatch(/<h1\b[^>]*>首页<\/h1>/u);
    expect(metadata.title).toBe("火球");
  });

  it("separates real-source finance from synthetic community content", async () => {
    /*
     * 这条用例过去直接断言「暂时没有资讯」，等于把「快照不存在」
     * 当成产品的固定状态——真的跑了采集脚本之后它就会失败，而失败的原因
     * 恰恰是功能做成了。
     *
     * 改为显式把快照目录指向一个不存在的路径，确定性地覆盖「无快照」分支。
     * 要守的东西没变也没被削弱：无快照时必须如实说明，且任何情况下都不能
     * 拿合成财经内容顶替真实来源区。
     */
    const original = process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY;
    process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY =
      "/nonexistent/huoqiu-smoke-no-snapshot";
    let markup: string;
    try {
      markup = await renderShell();
    } finally {
      if (original === undefined) {
        delete process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY;
      } else {
        process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY = original;
      }
    }

    /*
     * 区块名从「真实财经来源」改成了「监管披露与宏观数据」——用内容本身
     * 命名，而不是用「数据是不是真的」这种系统内部视角命名。断言的意图没变：
     * 这一区必须存在，且与社区内容分开。
     */
    expect(markup).toContain("监管披露与宏观数据");
    expect(markup).toContain("暂时没有资讯");
    // 标题改名为「社区内容」，它仍然是「社区区与真实财经区分离」的标记。
    expect(markup).toContain("社区内容");
    /*
     * 环境标识收敛成了「预览环境」。「本地受保护」描述的是部署配置，
     * 而它出现在顶栏最显眼的位置、每一页都在——读者只需要知道这不是正式环境。
     */
    expect(markup).toContain("预览环境");
    expect(markup).not.toContain("当前使用演示数据和合成数据");
    expect(markup).not.toContain("星海智造完成日内数据更新");
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
