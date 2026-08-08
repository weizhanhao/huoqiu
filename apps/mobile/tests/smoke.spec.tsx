import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomeScreen from "../app/index";

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

const renderShell = (): string => renderToStaticMarkup(<HomeScreen />);

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
    const brandMark = findDecorativeBrandMark(HomeScreen());
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

  it("describes a neutral public-market information workspace", () => {
    expect(renderShell()).toContain("公开市场信息的观察与整理");
  });

  it.each(forbiddenProductLanguage)("does not expose %s", (language) => {
    expect(renderShell()).not.toContain(language);
  });
});
