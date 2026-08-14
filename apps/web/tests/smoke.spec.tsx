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
     * 这条用例过去直接断言「真实财经快照尚未生成」，等于把「快照不存在」
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

    expect(markup).toContain("真实财经来源");
    expect(markup).toContain("真实财经快照尚未生成");
    // 标题改名为「社区内容」，它仍然是「社区区与真实财经区分离」的标记。
    expect(markup).toContain("社区内容");
    expect(markup).toContain("本地受保护预览");
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
