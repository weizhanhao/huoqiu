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
    expect(markup).toContain("真实财经采集任务尚未生成公共快照");
    expect(markup).toContain("不使用合成财经信息补位");
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
    expect(markup).toContain("最新 20 条真实来源记录");
    expect(markup).toContain("真实财经采集任务尚未生成公共快照");
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
    expect(markup).toContain("真实财经采集任务尚未生成公共快照");
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
