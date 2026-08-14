import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  cssVariables,
  lightCssVariables,
  tokensToCssVariables,
  tokensToThemedCssVariables,
} from "../src/css.js";
import { darkTokens, tokens } from "../src/tokens.js";

const relativeLuminance = (hex: string): number => {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);

  if (channels?.length !== 3) {
    throw new Error(`Expected six-digit hex color, received ${hex}`);
  }

  return channels
    .map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, channel, index) =>
        sum + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0),
      0,
    );
};

const contrastRatio = (foreground: string, background: string): number => {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );

  return (lighter + 0.05) / (darker + 0.05);
};

/** 文字可能落在的所有承载面。任何正文级文字色都要对全部面达标。 */
const lightTextSurfaces = [
  tokens.surface.base,
  tokens.surface.canvas,
  tokens.surface.sunken,
  tokens.surface.subtle,
];

const darkTextSurfaces = [
  darkTokens.surface.base,
  darkTokens.surface.canvas,
  darkTokens.surface.sunken,
  darkTokens.surface.subtle,
  darkTokens.surface.raised,
];

describe("Huoqiu design tokens", () => {
  it("keeps an original blue identity with A-share market semantics", () => {
    // 红涨绿跌：A 股语义，不能按欧美习惯反过来。
    expect(tokens.market.up).toBe("#E5484D");
    expect(tokens.market.down).toBe("#17A673");
    expect(tokens.brand.primary).toBe("#0967C7");
    // 雪球蓝，必须保持区分。
    expect(tokens.brand.primary).not.toBe("#1976D2");
    expect(tokens.surface.base).toBe("#FFFFFF");
  });

  it("layers surfaces and borders instead of stacking shadows", () => {
    // 五档承载面必须互不相同，否则分层就是假的。
    const surfaces = [
      tokens.surface.sunken,
      tokens.surface.canvas,
      tokens.surface.base,
      tokens.surface.subtle,
      tokens.surface.inverse,
    ];
    expect(new Set(surfaces).size).toBe(surfaces.length);

    // canvas 必须比 base 暗，卡片才能从页面底色上浮起来。
    expect(relativeLuminance(tokens.surface.canvas)).toBeLessThan(
      relativeLuminance(tokens.surface.base),
    );
    // sunken 必须比 canvas 更暗，输入框才像凹进去的。
    expect(relativeLuminance(tokens.surface.sunken)).toBeLessThan(
      relativeLuminance(tokens.surface.canvas),
    );

    // 三档描边由浅到深，且都存在。
    const borders = [
      tokens.border.subtle,
      tokens.border.default,
      tokens.border.strong,
    ];
    expect(new Set(borders).size).toBe(borders.length);
    expect(relativeLuminance(tokens.border.subtle)).toBeGreaterThan(
      relativeLuminance(tokens.border.default),
    );
    expect(relativeLuminance(tokens.border.default)).toBeGreaterThan(
      relativeLuminance(tokens.border.strong),
    );
  });

  it("covers hierarchy, layout, data typography, and accessible targets", () => {
    expect(tokens.spacing[4]).toBe("16px");
    expect(tokens.radius.card).toBeDefined();
    expect(tokens.shadow.card).toBeDefined();
    expect(tokens.type.size.body).toBeDefined();
    // 行情数字梯度与正文字号解耦。
    expect(tokens.type.size.data).toBeDefined();
    expect(tokens.type.size.dataLarge).toBeDefined();
    expect(tokens.type.size.dataHero).toBeDefined();
    expect(tokens.touch.webMinimum).toBe("44px");
    expect(tokens.touch.appMinimum).toBe("48px");
  });

  it("maintains AA contrast for light-theme text on every surface", () => {
    const normalTextColors = [
      tokens.text.primary,
      tokens.text.secondary,
      tokens.text.tertiary,
      tokens.text.link,
      tokens.text.linkHover,
    ];

    // disabled 是非交互状态文案，按 WCAG 豁免，故不纳入。
    for (const color of normalTextColors) {
      for (const surface of lightTextSurfaces) {
        expect(contrastRatio(color, surface)).toBeGreaterThanOrEqual(4.5);
      }
    }

    expect(
      contrastRatio(tokens.brand.onPrimary, tokens.brand.primary),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(tokens.text.inverse, tokens.surface.inverse),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(tokens.text.inverseMuted, tokens.surface.inverse),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(tokens.brand.secondary, tokens.surface.inverse),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("maintains AA contrast for dark-theme text on every surface", () => {
    const darkTextColors = [
      darkTokens.text.primary,
      darkTokens.text.secondary,
      darkTokens.text.tertiary,
      darkTokens.text.link,
      darkTokens.text.linkHover,
    ];

    for (const color of darkTextColors) {
      for (const surface of darkTextSurfaces) {
        expect(contrastRatio(color, surface)).toBeGreaterThanOrEqual(4.5);
      }
    }

    expect(
      contrastRatio(darkTokens.brand.onPrimary, darkTokens.brand.primary),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("provides AA-safe market text colors in both themes", () => {
    for (const color of [
      tokens.market.upText,
      tokens.market.downText,
      tokens.market.warningText,
      tokens.market.flat,
    ]) {
      for (const surface of lightTextSurfaces) {
        expect(contrastRatio(color, surface)).toBeGreaterThanOrEqual(4.5);
      }
    }

    for (const color of [
      darkTokens.market.upText,
      darkTokens.market.downText,
      darkTokens.market.warningText,
      darkTokens.market.flat,
    ]) {
      for (const surface of darkTextSurfaces) {
        expect(contrastRatio(color, surface)).toBeGreaterThanOrEqual(4.5);
      }
    }

    // 图表原色与文字色必须分开：原色为了在白底上够鲜艳，达不到文字对比度。
    expect(tokens.market.upText).not.toBe(tokens.market.up);
    expect(tokens.market.downText).not.toBe(tokens.market.down);
    expect(darkTokens.market.upText).not.toBe(darkTokens.market.up);
    expect(darkTokens.market.downText).not.toBe(darkTokens.market.down);
  });

  it("separates up and down by hue, not by brightness", () => {
    // 用亮度对比衡量红绿可辨性是错的指标：两色亮度接近才是正常的，
    // 差异应该在色相上。这里直接断言红绿通道的主导关系，
    // 顺带把"红涨绿跌"这条 A 股语义钉死。
    const redMinusGreen = (hex: string): number => {
      const red = Number.parseInt(hex.slice(1, 3), 16);
      const green = Number.parseInt(hex.slice(3, 5), 16);
      return red - green;
    };

    for (const theme of [tokens, darkTokens]) {
      // 涨 = 红占优，跌 = 绿占优，各自留出足够色相余量。
      expect(redMinusGreen(theme.market.up)).toBeGreaterThan(60);
      expect(redMinusGreen(theme.market.down)).toBeLessThan(-60);
    }

    // 单靠颜色不足以传达涨跌，组件层必须同时给出正负号；
    // 该约束由 apps/web 的组件测试覆盖，此处只保证令牌不背离语义。
  });

  it("generates deterministic, namespaced CSS variables", () => {
    expect(tokensToCssVariables(tokens)).toBe(lightCssVariables);
    expect(lightCssVariables).toContain("--hq-brand-primary: #0967C7;");
    expect(lightCssVariables).toContain("--hq-market-down: #17A673;");
    expect(lightCssVariables).toContain("--hq-market-down-text: #05714B;");
    expect(lightCssVariables).toContain("--hq-touch-app-minimum: 48px;");
    expect(lightCssVariables).toContain("--hq-radius-card: 8px;");

    const names = [...lightCssVariables.matchAll(/--hq-[a-z0-9-]+/gu)].map(
      ([name]) => name,
    );
    const declarationLines = lightCssVariables
      .split("\n")
      .filter((line) => line.startsWith("  --hq-"));

    for (const line of declarationLines) {
      expect(line).toMatch(
        /^ {2}--hq-[a-z0-9]+(?:-[a-z0-9]+)*: [^\n\r;{}]+;$/u,
      );
    }
    expect(names).toEqual([...names].sort());
    expect(declarationLines).toHaveLength(names.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("emits all three theme states so every user resolution path is covered", () => {
    // 跟随系统（浅）→ :root
    expect(cssVariables).toContain(":root {");
    expect(cssVariables).toContain("color-scheme: light;");
    // 跟随系统（深）
    expect(cssVariables).toContain("@media (prefers-color-scheme: dark) {");
    // 显式选亮色的用户不能被系统深色翻掉
    expect(cssVariables).toContain(':root:not([data-theme="light"]) {');
    // 显式选暗色，在浅色系统下也要生效
    expect(cssVariables).toContain(':root[data-theme="dark"] {');
    expect(cssVariables).toContain("color-scheme: dark;");

    expect(cssVariables).toContain(
      `--hq-surface-base: ${tokens.surface.base};`,
    );
    expect(cssVariables).toContain(
      `--hq-surface-base: ${darkTokens.surface.base};`,
    );
  });

  it("rejects a dark override that light theme never defined", () => {
    // 否则跟随系统的浅色用户会拿到一个空变量。
    expect(() =>
      tokensToThemedCssVariables({ known: "#FFFFFF" }, { unknown: "#000000" }),
    ).toThrow("Dark theme overrides unknown CSS variable --hq-unknown");
  });

  it("keeps every dark override anchored to a real light token", () => {
    const lightNames = new Set(
      [...lightCssVariables.matchAll(/--hq-[a-z0-9-]+/gu)].map(([n]) => n),
    );
    const darkNames = [
      ...tokensToCssVariables(darkTokens).matchAll(/--hq-[a-z0-9-]+/gu),
    ].map(([n]) => n);

    expect(darkNames.length).toBeGreaterThan(0);
    for (const name of darkNames) {
      expect(lightNames).toContain(name);
    }
  });

  it("rejects unsafe, empty, or colliding CSS variable input", () => {
    expect(() => tokensToCssVariables({})).toThrow("at least one");
    expect(() => tokensToCssVariables({ "unsafe key": "value" })).toThrow(
      "safe CSS token name",
    );
    expect(() => tokensToCssVariables({ safe: "red; color: blue" })).toThrow(
      "safe CSS token value",
    );
    expect(() =>
      tokensToCssVariables({ Primary: "one", primary: "two" }),
    ).toThrow("Duplicate CSS variable");
  });

  it.each([
    "red/* swallow following declarations */",
    "*/ resume escaped declaration",
    "</style><script>alert(1)</script>",
    "URL  (javascript:alert(1))",
    "ExPrEsSiOn (alert(1))",
    "red\\00000a",
  ])("rejects CSS or inline-style escape value %j", (value) => {
    expect(() => tokensToCssVariables({ safe: value })).toThrow(
      "safe CSS token value",
    );
    // 主题化输出走同一套校验，暗色侧不能是绕过口。
    expect(() =>
      tokensToThemedCssVariables({ safe: "#FFFFFF" }, { safe: value }),
    ).toThrow("safe CSS token value");
  });

  it.each(["huoqiu-mark.svg", "demo-avatar.svg"])(
    "ships accessible original artwork in %s",
    (fileName) => {
      const svg = readFileSync(
        new URL(`../assets/${fileName}`, import.meta.url),
        "utf8",
      );

      expect(svg).toContain('role="img"');
      expect(svg).toMatch(/<title(?:\s[^>]*)?>[^<]+<\/title>/u);
      expect(svg).not.toContain("雪球");
      expect(svg).not.toContain("1976D2");
    },
  );
});
