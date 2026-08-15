import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import BriefingPage from "../../src/app/7x24/page";
import NewsDetailPage from "../../src/app/news/[newsId]/page";
import NewsPage from "../../src/app/news/page";

const temporaryDirectories: string[] = [];

const useEmptyFinanceRuntime = async () => {
  const directory = await mkdtemp(join(tmpdir(), "huoqiu-finance-routes-"));
  temporaryDirectories.push(directory);
  process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY = directory;
};

afterEach(async () => {
  delete process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY;
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("finance information routes", () => {
  it("renders an honest real-source news state without synthetic fallback", async () => {
    await useEmptyFinanceRuntime();
    const markup = renderToStaticMarkup(
      await NewsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(markup).toContain("财经资讯");
    expect(markup).toContain('data-testid="real-finance-hub"');
    expect(markup).toContain("稍后再来看看");
    /*
     * 「不使用样本内容补位」这句自证从界面上去掉了——这是个 MVP，不是演示系统，
     * 不必逐句解释自己的数据治理。这条用例真正守的是下一行：没有真实数据时
     * 绝不拿合成内容顶替。
     */
    expect(markup).not.toContain("星港制造合成订单样本保持韧性");
  });

  it("fails closed when the runtime snapshot directory is misconfigured", async () => {
    process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY = ".runtime/finance";
    const markup = renderToStaticMarkup(
      await NewsPage({
        searchParams: Promise.resolve({
          channel: "company",
          q: "不存在的标的",
        }),
      }),
    );

    expect(markup).toContain("真实财经快照校验失败");
    expect(markup).toContain("当前与上一份真实财经快照均未通过完整性校验");
    expect(markup).not.toContain("星港制造合成订单样本保持韧性");
  });

  it("renders an honest real-source 7x24 state without synthetic fallback", async () => {
    await useEmptyFinanceRuntime();
    const markup = renderToStaticMarkup(await BriefingPage());

    expect(markup).toContain('data-testid="real-finance-briefing"');
    /*
     * 页头原先是「最新 20 条真实来源记录」。那一页现在分两块：上面是分钟级
     * 实时快讯，下面才是这份官方申报记录——申报快照更新得慢，最新一条常常
     * 是两天前的，而栏目名叫 7×24。
     */
    expect(markup).toContain("7×24 快讯");
    /*
     * 「官方申报记录」这个小标题改成了「境外申报存档」：那份 SEC 快照是
     * 美股申报，而这是 A 股站；它也不是实时的，靠采集任务定期刷新。
     * A 股公告另起一块，走巨潮，实时。
     */
    expect(markup).toContain("上市公司公告");
    expect(markup).toContain("境外申报存档");
    expect(markup).toContain("稍后再来看看");
    expect(markup).not.toContain("7×24 合成快讯");
    expect(markup).not.toContain("brief_syn_afternoon_pulse");
  });

  it("renders an honest real-source detail state without synthetic fallback", async () => {
    await useEmptyFinanceRuntime();
    const markup = renderToStaticMarkup(
      await NewsDetailPage({
        params: Promise.resolve({ newsId: "finance_missing_record" }),
      }),
    );

    expect(markup).toContain('data-testid="real-finance-detail"');
    expect(markup).toContain("财经记录详情");
    expect(markup).toContain("稍后再来看看");
    expect(markup).not.toContain("company_syn_starport_orders");
    expect(markup).not.toContain("星港制造合成订单样本保持韧性");
  });

  it("keeps briefing and news on distinct current global channels", async () => {
    await useEmptyFinanceRuntime();
    const briefingMarkup = renderToStaticMarkup(await BriefingPage());
    const newsMarkup = renderToStaticMarkup(
      await NewsPage({ searchParams: Promise.resolve({}) }),
    );
    const detailMarkup = renderToStaticMarkup(
      await NewsDetailPage({
        params: Promise.resolve({ newsId: "company_syn_starport_orders" }),
      }),
    );

    expect(briefingMarkup).toContain(
      '<a aria-current="page" href="/7x24">7x24</a>',
    );
    expect(newsMarkup).toContain(
      '<a aria-current="page" href="/news">资讯</a>',
    );
    expect(detailMarkup).toContain(
      '<a aria-current="page" href="/news">资讯</a>',
    );
  });
});
