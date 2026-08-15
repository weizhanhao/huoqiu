import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  RealFinanceBriefing,
  RealFinanceDetail,
  RealFinanceHub,
  RealFinanceHomeSummary,
  type FinancePublicViewModel,
} from "../../src/features/real-finance";
import { denseFinanceModel } from "./real-finance-test-model";

const sourceOnlyModel = {
  state: "ready",
  generatedAt: "2026-08-12T01:30:00.000Z",
  selectedRecordId: null,
  sources: [
    {
      id: "sec",
      label: "SEC EDGAR",
      description: "美国上市公司官方申报元数据",
      status: "healthy",
      updatedAt: "2026-08-12T01:28:00.000Z",
      recordCount: 8,
      cadenceLabel: "每 5 分钟",
    },
    {
      id: "gdelt",
      label: "GDELT",
      description: "全球新闻发现元数据与原文链接",
      status: "degraded",
      updatedAt: "2026-08-12T01:20:00.000Z",
      recordCount: 12,
      cadenceLabel: "每 15 分钟",
    },
    {
      id: "nbs",
      label: "国家统计局",
      description: "中国宏观数据官方发布元数据",
      status: "stale",
      updatedAt: "2026-08-12T00:30:00.000Z",
      recordCount: 6,
      cadenceLabel: "每 1 小时",
    },
  ],
  records: [],
} satisfies FinancePublicViewModel;

describe("real finance presentational seam", () => {
  it("renders the latest six real records on home with local detail links", () => {
    const markup = renderToStaticMarkup(
      <RealFinanceHomeSummary model={denseFinanceModel} />,
    );

    expect(markup).toContain('data-testid="real-finance-home-summary"');
    expect(markup.match(/data-home-finance-record="true"/gu)).toHaveLength(6);
    expect(markup).toContain(
      `href="/news/${denseFinanceModel.records[0]?.id}"`,
    );
    expect(markup).not.toContain("合成财经");
  });

  it("renders the three injected source states without inventing finance data", () => {
    const markup = renderToStaticMarkup(
      <RealFinanceHub model={sourceOnlyModel} />,
    );

    for (const source of ["SEC EDGAR", "GDELT", "国家统计局"]) {
      expect(markup).toContain(source);
    }
    expect(markup).toContain("运行正常");
    expect(markup).toContain("部分降级");
    expect(markup).toContain("数据陈旧");
    expect(markup).not.toContain("演示资讯");
  });

  it("renders dense source sections with a metadata-only GDELT policy", () => {
    const markup = renderToStaticMarkup(
      <RealFinanceHub model={denseFinanceModel} />,
    );

    expect(markup.match(/data-record-source="sec"/gu)).toHaveLength(8);
    expect(markup.match(/data-record-source="gdelt"/gu)).toHaveLength(12);
    expect(markup.match(/data-record-source="nbs"/gu)).toHaveLength(6);
    expect(markup).toContain("仅展示标题、来源、时间和原始链接");
    expect(markup).toContain("U.S. Securities and Exchange Commission");
    expect(markup).toContain("发布时间");
    expect(markup).toContain("采集时间");
    expect(markup).toContain("新鲜");
    expect(markup).toContain("已陈旧");
    expect(markup).toContain("Source: SEC EDGAR");
    expect(markup).toContain('href="/news/sec-record-01"');
    expect(markup).toContain("查看站内详情");
    expect(markup).toMatch(
      /<a\b[^>]*rel="noopener noreferrer nofollow"[^>]*>/u,
    );
    expect(markup).toMatch(/<a\b[^>]*target="_blank"[^>]*>/u);
    expect(markup).toMatch(
      /<a\b[^>]*lang="en"[^>]*>Global market source link 1/u,
    );
    const gdeltCard = markup.match(
      /<article\b[^>]*data-record-source="gdelt"[^>]*>.*?<\/article>/su,
    )?.[0];
    expect(gdeltCard).toContain("原发布域");
    expect(gdeltCard).toContain("Publisher 1");
    expect(gdeltCard).toContain("元数据来自 GDELT");
    expect(markup).not.toContain("<img");
  });

  it("keeps missing, invalid, empty, degraded, and stale states honest", () => {
    const expectedStates = [
      ["missing", "暂时没有资讯", false],
      ["invalid", "真实财经快照校验失败", false],
      ["empty", "当前真实来源暂无可公开记录", false],
      ["degraded", "部分真实来源暂时不可用", true],
      ["stale", "展示上次成功更新的真实数据", true],
    ] as const;

    for (const [state, message, keepsRecords] of expectedStates) {
      const markup = renderToStaticMarkup(
        <RealFinanceHub
          model={{
            ...denseFinanceModel,
            state,
            statusMessage: "上游状态由公共快照明确标记",
          }}
        />,
      );

      /*
       * 「不会使用样本内容补位」这句承诺从界面上去掉了：读者在失败的那一刻
       * 只关心发生了什么、怎么办，而不是听我们表态不造假。用例守的东西没变——
       * 每种状态都得如实说出自己是哪一种，这由上面的 message 断言保证。
       */
      expect(markup).toContain(message);
      expect(markup).not.toContain('class="undefined"');
      expect(markup).not.toContain(" undefined");
      expect(markup.includes('data-record-source="sec"')).toBe(keepsRecords);
    }
  });

  it("renders the latest 20 real records in absolute-time date groups", () => {
    const markup = renderToStaticMarkup(
      <RealFinanceBriefing model={denseFinanceModel} />,
    );

    expect(markup.match(/data-briefing-item="true"/gu)).toHaveLength(20);
    expect(markup).toContain('aria-label="2026-08-12 快讯"');
    expect(markup).toContain('aria-label="2026-08-11 快讯"');
    expect(markup).toContain("测试公司 1 向 SEC 提交 Form 8-K");
    expect(markup).not.toContain("Global market source link 14");
    // 页头改成「7×24 快讯」，申报记录降为其中一块，见组件里的说明。
    expect(markup).toContain("7×24 快讯");
    /*
     * 「官方申报记录」这个小标题改成了「境外申报存档」：那份 SEC 快照是
     * 美股申报，而这是 A 股站；它也不是实时的，靠采集任务定期刷新。
     * A 股公告另起一块，走巨潮，实时。
     */
    expect(markup).toContain("上市公司公告");
    expect(markup).toContain("境外申报存档");
    expect(markup).toContain('href="/news/sec-record-01"');
    expect(markup).toContain("查看站内详情");
    expect(markup).toMatch(/<time\b[^>]*dateTime=/u);
    expect(markup).toMatch(
      /<a\b[^>]*rel="noopener noreferrer nofollow"[^>]*>/u,
    );
    expect(markup).toMatch(
      /<a\b[^>]*lang="en"[^>]*>Global market source link 1/u,
    );
  });

  it("renders detail as structured facts and source metadata, never copied news content", () => {
    const filingMarkup = renderToStaticMarkup(
      <RealFinanceDetail model={denseFinanceModel} />,
    );
    const gdeltMarkup = renderToStaticMarkup(
      <RealFinanceDetail
        model={{ ...denseFinanceModel, selectedRecordId: "gdelt-record-01" }}
      />,
    );

    expect(filingMarkup).toContain("测试公司 1 向 SEC 提交 Form 8-K");
    expect(filingMarkup).toContain("结构化事实");
    expect(filingMarkup).toContain("提交编号");
    expect(filingMarkup).toContain("000-test-1");
    expect(filingMarkup).toContain("采集时间");
    expect(filingMarkup).toContain("Source: SEC EDGAR");
    expect(filingMarkup).toMatch(
      /<a\b[^>]*rel="noopener noreferrer nofollow"[^>]*>[^<]*打开外部原始来源/u,
    );

    expect(gdeltMarkup).toContain("Global market source link 1");
    expect(gdeltMarkup).toMatch(
      /<h1\b[^>]*lang="en"[^>]*>Global market source link 1<\/h1>/u,
    );
    expect(gdeltMarkup).toContain("原发布域");
    expect(gdeltMarkup).toContain("Publisher 1");
    expect(gdeltMarkup).toContain("元数据来自 GDELT");
    expect(gdeltMarkup).toContain("GDELT 只提供发现元数据");
    expect(gdeltMarkup).not.toContain("结构化事实");
    expect(gdeltMarkup).not.toContain("<img");
  });

  it("hardens and clearly names every external-source link", () => {
    const surfaces = [
      renderToStaticMarkup(<RealFinanceHub model={denseFinanceModel} />),
      renderToStaticMarkup(<RealFinanceBriefing model={denseFinanceModel} />),
      renderToStaticMarkup(<RealFinanceDetail model={denseFinanceModel} />),
    ];

    for (const markup of surfaces) {
      const externalLinks = markup.match(/<a\b[^>]*target="_blank"[^>]*>/gu);
      expect(externalLinks?.length).toBeGreaterThan(0);

      for (const link of externalLinks ?? []) {
        expect(link).toContain('rel="noopener noreferrer nofollow"');
        expect(link).toMatch(/aria-label="打开外部原始来源(?:：|&quot;)[^"]+/u);
      }
    }
  });

  it("fails closed instead of rendering unsafe source URLs", () => {
    const unsafeUrls = [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://example.com/report",
      "https://127.0.0.1/report",
      "https://[::1]/report",
      "https://localhost/report",
      "https://user:secret@example.com/report",
      "https://example.com/report#section",
      "https://example.com:444/report",
    ];
    const sourceRecord = denseFinanceModel.records[0];

    expect(sourceRecord).toBeDefined();
    if (sourceRecord === undefined) return;

    for (const sourceUrl of unsafeUrls) {
      const unsafeModel = {
        ...denseFinanceModel,
        records: [{ ...sourceRecord, sourceUrl }],
        selectedRecordId: sourceRecord.id,
      } as unknown as FinancePublicViewModel;
      const surfaces = [
        renderToStaticMarkup(<RealFinanceHub model={unsafeModel} />),
        renderToStaticMarkup(<RealFinanceBriefing model={unsafeModel} />),
        renderToStaticMarkup(<RealFinanceDetail model={unsafeModel} />),
      ];

      for (const markup of surfaces) {
        expect(markup).toContain(sourceRecord.title);
        expect(markup).toContain("原始来源链接不可用");
        expect(markup).not.toContain(sourceUrl);
        expect(markup).not.toContain('target="_blank"');
      }
    }
  });

  it("fails closed across briefing and detail for invalid snapshots", () => {
    const invalidModel = {
      ...denseFinanceModel,
      state: "invalid" as const,
      statusMessage: "记录校验未通过",
    };
    const briefingMarkup = renderToStaticMarkup(
      <RealFinanceBriefing model={invalidModel} />,
    );
    const detailMarkup = renderToStaticMarkup(
      <RealFinanceDetail model={invalidModel} />,
    );

    for (const markup of [briefingMarkup, detailMarkup]) {
      expect(markup).toContain("真实财经快照校验失败");
      expect(markup).not.toContain("测试公司 1 向 SEC 提交 Form 8-K");
      expect(markup).not.toContain('data-briefing-item="true"');
    }
  });
});
