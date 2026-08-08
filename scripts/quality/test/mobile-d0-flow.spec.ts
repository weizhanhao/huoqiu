import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const flowPath = new URL(
  "../../../tests/e2e/maestro/d0/golden.yaml",
  import.meta.url,
);

describe("D0 Maestro flow", () => {
  it("covers the native fixture golden path without Web substitution", () => {
    const flow = readFileSync(flowPath, "utf8");

    expect(flow).toContain("appId: com.huoqiu.alpha");
    expect(flow).toContain("clearState: true");
    expect(flow).toContain('assertVisible: "演示数据"');
    expect(flow).toContain('tapOn: "搜索演示标的"');
    expect(flow).toContain('tapOn: "输入演示标的关键词"');
    expect(flow).toContain("inputText: SYN001");
    expect(flow).toContain('tapOn: "提交演示标的搜索"');
    expect(flow).toContain('tapOn: "打开合成示例一号详情"');
    expect(flow).toContain('assertVisible: "huoqiu-synthetic"');
    expect(flow).toContain('tapOn: "加自选"');
    expect(flow.match(/tapOn: "返回"/gu)).toHaveLength(2);
    expect(flow).toContain('tapOn: "自选"');
    expect(flow).toContain('assertVisible: "合成示例一号"');
    expect(flow).not.toMatch(/localhost|127\.0\.0\.1|expo\s+web/iu);
  });
});
