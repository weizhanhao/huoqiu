import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { parseAllDocuments } from "yaml";

const flowPath = new URL(
  "../../../tests/e2e/maestro/d0/golden.yaml",
  import.meta.url,
);

describe("D0 Maestro flow", () => {
  it("parses a native add-once-reset-empty flow whose labels come from the app", () => {
    const flow = readFileSync(flowPath, "utf8");
    const documents = parseAllDocuments(flow);
    expect(documents).toHaveLength(2);
    expect(documents.every((document) => document.errors.length === 0)).toBe(
      true,
    );

    const header = documents[0]?.toJS() as Record<string, unknown>;
    const commands = documents[1]?.toJS() as Array<Record<string, unknown>>;
    expect(header).toMatchObject({
      appId: "com.huoqiu.alpha",
      name: "D0 fixture golden path",
    });
    expect(commands).toEqual([
      { launchApp: { clearState: true } },
      { assertVisible: "演示数据" },
      { tapOn: "搜索演示标的" },
      { tapOn: "输入演示标的关键词" },
      { inputText: "SYN001" },
      { tapOn: "提交演示标的搜索" },
      { assertVisible: "搜索结果" },
      { tapOn: "打开合成示例一号详情" },
      { assertVisible: "huoqiu-synthetic" },
      { assertVisible: "演示数据说明" },
      { tapOn: "加自选" },
      { assertVisible: "已加自选" },
      { tapOn: "返回" },
      { tapOn: "返回" },
      { tapOn: "自选" },
      { assertVisible: "我的自选" },
      { assertVisible: "自选标的 1 个" },
      { tapOn: "重置自选" },
      { assertVisible: "暂无自选标的，可从详情页加入" },
    ]);

    const appSources = [
      "../../../apps/mobile/src/components/d0/home-feed.tsx",
      "../../../apps/mobile/src/components/d0/instrument-search.tsx",
      "../../../apps/mobile/src/components/d0/instrument-detail.tsx",
      "../../../apps/mobile/src/components/d0/screen-header.tsx",
      "../../../apps/mobile/src/components/d0/watchlist-panel.tsx",
      "../../../apps/mobile/src/components/d0/watchlist-toggle.tsx",
      "../../../apps/mobile/app/(tabs)/_layout.tsx",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
    for (const label of [
      "演示数据",
      "搜索演示标的",
      "输入演示标的关键词",
      "提交演示标的搜索",
      "搜索结果",
      "演示数据说明",
      "加自选",
      "已加自选",
      "返回",
      "自选",
      "我的自选",
      "自选标的 1 个",
      "重置自选",
      "暂无自选标的，可从详情页加入",
    ]) {
      expect(
        appSources.some((source) => source.includes(label)),
        `Maestro label is not rendered or exposed by the app: ${label}`,
      ).toBe(true);
    }
    expect(flow).not.toMatch(/localhost|127\.0\.0\.1|expo\s+web/iu);
  });
});
