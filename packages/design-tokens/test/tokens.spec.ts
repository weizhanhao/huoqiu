import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { cssVariables, tokensToCssVariables } from "../src/css.js";
import { tokens } from "../src/tokens.js";

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

describe("Huoqiu design tokens", () => {
  it("uses the agreed financial market semantics and an original brand color", () => {
    expect(tokens.market.up).toBe("#F04444");
    expect(tokens.market.down).toBe("#16A37A");
    expect(tokens.brand.primary).not.toBe("#1976D2");
    expect(tokens.brand.primary).not.toMatch(
      /^#(?:1[0-9A-F]|2[0-9A-F])7[0-9A-F]{3}$/iu,
    );
  });

  it("covers information hierarchy, layout, typography, and accessible targets", () => {
    expect(tokens.surface.canvas).toBeDefined();
    expect(tokens.text.secondary).toBeDefined();
    expect(tokens.spacing[4]).toBe("16px");
    expect(tokens.radius.card).toBeDefined();
    expect(tokens.shadow.card).toBeDefined();
    expect(tokens.type.size.body).toBeDefined();
    expect(tokens.touch.webMinimum).toBe("44px");
    expect(tokens.touch.appMinimum).toBe("48px");
  });

  it("maintains AA contrast for primary text and brand buttons", () => {
    expect(
      contrastRatio(tokens.text.primary, tokens.surface.base),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(tokens.brand.onPrimary, tokens.brand.primary),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("generates deterministic, namespaced CSS variables", () => {
    expect(tokensToCssVariables(tokens)).toBe(cssVariables);
    expect(cssVariables).toContain("--hq-brand-primary: #C2410C;");
    expect(cssVariables).toContain("--hq-market-down: #16A37A;");
    expect(cssVariables).toContain("--hq-touch-app-minimum: 48px;");

    const names = [...cssVariables.matchAll(/--hq-[a-z0-9-]+/gu)].map(
      ([name]) => name,
    );
    expect(names).toEqual([...names].sort());
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
