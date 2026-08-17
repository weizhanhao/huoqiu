import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeFeed } from "../src/components/d0/home-feed";
import { ScreenHeader } from "../src/components/d0/screen-header";
import { loadD0Fixture } from "../src/lib/d0-fixture";
import { d0RuntimeRoutes } from "../src/navigation/d0-routes";

const forbiddenProductLanguage = ["雪球", "开户", "认购", "交易下单"];

type SemanticSnapshot = Readonly<{
  headings: readonly Readonly<{ level: number; name: string }>[];
  textNodes: readonly string[];
}>;

interface ElementFrame {
  readonly attributes: ReadonlyMap<string, string>;
  readonly hidden: boolean;
  readonly tag: string;
  text: string;
}

const parseAttributes = (source: string): ReadonlyMap<string, string> =>
  new Map(
    [...source.matchAll(/([^\s=]+)="([^"]*)"/gu)].map((match) => [
      match[1] ?? "",
      match[2] ?? "",
    ]),
  );

const readSemanticSnapshot = (markup: string): SemanticSnapshot => {
  const headings: { level: number; name: string }[] = [];
  const stack: ElementFrame[] = [];
  const textNodes: string[] = [];
  const tokens = markup.matchAll(
    /<(?<closing>\/)?(?<tag>[a-z][a-z0-9-]*)(?<attributes>[^>]*)>|(?<text>[^<]+)/giu,
  );

  for (const token of tokens) {
    const groups = token.groups;
    if (groups === undefined) {
      continue;
    }

    if (groups.text !== undefined) {
      const text = groups.text.trim();
      if (text.length === 0 || stack.at(-1)?.hidden === true) {
        continue;
      }

      textNodes.push(text);
      for (const frame of stack) {
        frame.text += text;
      }
      continue;
    }

    const tag = groups.tag?.toLowerCase();
    if (tag === undefined) {
      continue;
    }

    if (groups.closing === "/") {
      const frame = stack.pop();
      if (
        frame?.tag === tag &&
        frame.hidden === false &&
        frame.attributes.get("role") === "heading"
      ) {
        headings.push({
          level: Number(frame.attributes.get("aria-level")),
          name: frame.text,
        });
      }
      continue;
    }

    const attributes = parseAttributes(groups.attributes ?? "");
    const frame: ElementFrame = {
      attributes,
      hidden:
        stack.at(-1)?.hidden === true ||
        attributes.get("aria-hidden") === "true",
      tag,
      text: "",
    };
    stack.push(frame);

    if ((groups.attributes ?? "").trimEnd().endsWith("/")) {
      stack.pop();
    }
  }

  return { headings, textNodes };
};

const readLiteralText = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (!isValidElement(node)) {
    return "";
  }

  const properties = node.props as Readonly<{ children?: ReactNode }>;
  return Children.toArray(properties.children).map(readLiteralText).join("");
};

const findDecorativeBrandMark = (node: ReactNode): ReactElement => {
  if (!isValidElement(node)) {
    throw new Error("Expected the decorative 火 mark");
  }

  const properties = node.props as Readonly<{ children?: ReactNode }>;
  if (
    typeof properties.children !== "string" &&
    readLiteralText(properties.children) === "火"
  ) {
    return node;
  }

  for (const child of Children.toArray(properties.children)) {
    if (!isValidElement(child)) {
      continue;
    }
    try {
      return findDecorativeBrandMark(child);
    } catch {
      // Continue through the rendered element tree until the mark is found.
    }
  }

  throw new Error("Expected the decorative 火 mark");
};

const readyFixture = () => {
  const result = loadD0Fixture();
  if (result.status !== "ready") {
    throw new Error("Expected checked-in D0 fixture to parse");
  }
  return result.data;
};

const renderShell = (): string =>
  renderToStaticMarkup(<HomeFeed fixture={readyFixture()} state="normal" />);

describe("mobile shell", () => {
  it("renders exactly one level-one heading named 火球", () => {
    const snapshot = readSemanticSnapshot(renderShell());

    expect(snapshot.headings).toEqual([{ level: 1, name: "火球" }]);
  });

  it("rejects the legacy cross-element heading false positive", () => {
    const misleadingMarkup =
      '<div role="heading" aria-level="2">其他标题</div><div>火球</div>';
    const legacyPattern = /\brole="heading"[^>]*>[\s\S]*火球[\s\S]*<\/[^>]+>/u;

    expect(misleadingMarkup).toMatch(legacyPattern);
    expect(readSemanticSnapshot(misleadingMarkup).headings).toEqual([
      { level: 2, name: "其他标题" },
    ]);
  });

  it("hides the decorative 火 mark from Web, iOS, and Android accessibility", () => {
    const brandMark = findDecorativeBrandMark(
      ScreenHeader({
        title: "火球",
        subtitle: "公开市场信息的观察与整理",
      }),
    );
    const properties = brandMark.props as Readonly<{
      "aria-hidden"?: boolean;
      accessibilityElementsHidden?: boolean;
      importantForAccessibility?: string;
    }>;

    expect(properties["aria-hidden"]).toBe(true);
    expect(properties.accessibilityElementsHidden).toBe(true);
    expect(properties.importantForAccessibility).toBe("no-hide-descendants");
    expect(readSemanticSnapshot(renderShell()).textNodes).not.toContain("火");
  });

  it("renders an explicit accessible back control for stack screens", () => {
    const markup = renderToStaticMarkup(
      <ScreenHeader onBack={() => undefined} title="搜索" />,
    );

    expect(markup).toContain('aria-label="返回"');
    expect(markup).toContain("搜索");
  });

  it("describes a neutral public-market information workspace", () => {
    expect(renderShell()).toContain("公开市场信息的观察与整理");
  });

  it.each(forbiddenProductLanguage)("does not expose %s", (language) => {
    expect(renderShell()).not.toContain(language);
  });
});

describe("product naming across navigation surfaces", () => {
  /*
   * 上面那条禁用词断言只覆盖信息流的渲染结果，漏掉了导航文案——底部页签的
   * 标题一度被写成参考图里的「雪球」，而它是别人的产品名，却一条用例都没拦住。
   *
   * 导航文案不经渲染就能读到（路由表是常量，页签布局是源码），所以这里直接
   * 按文本查。查的是「用户看得见的地方」，注释里为解释参考图而提到它是允许的。
   */
  it("never puts another product's name in navigation", () => {
    const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    const surfaces = [
      JSON.stringify(d0RuntimeRoutes),
      readFileSync(join(mobileRoot, "app/(tabs)/_layout.tsx"), "utf8")
        .split("\n")
        .filter((line) => /title:|tabBarAccessibilityLabel:/u.test(line))
        .join("\n"),
    ];

    for (const surface of surfaces) {
      for (const forbidden of forbiddenProductLanguage) {
        expect(surface).not.toContain(forbidden);
      }
      expect(surface).toContain("火球");
    }
  });
});
