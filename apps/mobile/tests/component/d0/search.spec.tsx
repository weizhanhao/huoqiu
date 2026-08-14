import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  InstrumentSearch,
  searchD0Listings,
} from "../../../src/components/d0/instrument-search";
import { loadD0Fixture } from "../../../src/lib/d0-fixture";

const readyFixture = () => {
  const result = loadD0Fixture();
  if (result.status !== "ready") {
    throw new Error("Expected checked-in D0 fixture to parse");
  }
  return result.data;
};

describe("D0 mobile instrument search", () => {
  it.each([
    "SYN001",
    "syn001",
    "星海智造",
    "xinghaizhizao",
    "xinghai",
    "合成一号",
    "synthetic one",
  ])("finds listing_syn_0001 using %s", (query) => {
    expect(searchD0Listings(query, readyFixture())).toMatchObject([
      { listing_id: "listing_syn_0001" },
    ]);
  });

  it("renders a stable result and explicit no-result state", () => {
    const fixture = readyFixture();
    const result = renderToStaticMarkup(
      <InstrumentSearch fixture={fixture} query="SYN001" state="normal" />,
    );
    const empty = renderToStaticMarkup(
      <InstrumentSearch fixture={fixture} query="NOT-FOUND" state="normal" />,
    );

    expect(result).toContain("星海智造");
    expect(result).toContain("SYN001");
    expect(result).toContain("listing_syn_0001");
    expect(empty).toContain("没有找到匹配的演示标的");
    expect(empty).toContain("NOT-FOUND");
  });

  it("keeps draft input separate until the real search control submits it", () => {
    let submittedQuery = "";
    const fixture = readyFixture();
    const renderSearch = () =>
      InstrumentSearch({
        fixture,
        onSubmit: () => {
          submittedQuery = "SYN001";
        },
        query: "SYN001",
        state: "normal",
        submittedQuery,
      });

    expect(renderToStaticMarkup(renderSearch())).toContain("尚未提交搜索");
    expect(renderToStaticMarkup(renderSearch())).not.toContain("搜索结果");

    const submit = findElement(
      renderSearch(),
      (element) =>
        readProperties(element).accessibilityLabel === "提交演示标的搜索",
    );
    const submitProperties = readProperties(submit);
    expect(submitProperties.onPress).toBeTypeOf("function");
    submitProperties.onPress?.();

    const submittedMarkup = renderToStaticMarkup(renderSearch());
    expect(submittedMarkup).toContain("已提交：SYN001");
    expect(submittedMarkup).toContain("搜索结果");
    expect(submittedMarkup).toContain("星海智造");
  });
});

type ElementProperties = Readonly<{
  accessibilityLabel?: string;
  children?: ReactNode;
  onPress?: () => void;
}>;

const readProperties = (element: ReactElement): ElementProperties =>
  element.props as ElementProperties;

const findElement = (
  node: ReactNode,
  predicate: (element: ReactElement) => boolean,
): ReactElement => {
  if (!isValidElement(node)) {
    throw new Error("Expected a matching React element");
  }
  if (predicate(node)) {
    return node;
  }

  for (const child of Children.toArray(readProperties(node).children)) {
    if (!isValidElement(child)) {
      continue;
    }
    try {
      return findElement(child, predicate);
    } catch {
      // Continue until the real interactive control is found.
    }
  }

  throw new Error("Expected a matching React element");
};
