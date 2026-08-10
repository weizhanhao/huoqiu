import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  InstrumentSearch,
  searchD0Listings,
} from "../../../src/components/instrument/instrument-search";
import { loadD0Fixture } from "../../../src/lib/d0-fixture";

const readyFixture = () => {
  const result = loadD0Fixture();
  if (result.status !== "ready") {
    throw new Error("Expected the checked-in D0 fixture to parse");
  }
  return result.data;
};

describe("D0 instrument search", () => {
  it.each([
    "SYN001",
    "syn001",
    "合成示例一号",
    "hechengshiliyihao",
    "合成一号",
    "synthetic one",
  ])("finds the stable listing using %s", (query) => {
    expect(searchD0Listings(query, readyFixture())).toMatchObject([
      { listing_id: "listing_syn_0001" },
    ]);
  });

  it("trims queries and returns no broad result for blank input", () => {
    expect(searchD0Listings("  SYN001  ", readyFixture())).toHaveLength(1);
    expect(searchD0Listings("   ", readyFixture())).toEqual([]);
  });

  it("renders a result link with the stable listing ID", () => {
    const fixture = readyFixture();
    const markup = renderToStaticMarkup(
      <InstrumentSearch fixture={fixture} query="SYN001" state="normal" />,
    );

    expect(markup).toContain('value="SYN001"');
    expect(markup).toContain('href="/instruments/listing_syn_0001"');
    expect(markup).toContain("合成示例一号");
    expect(markup).toContain("108.64");
  });

  it("searches the complete synthetic market universe", () => {
    const fixture = readyFixture();
    const markup = renderToStaticMarkup(
      <InstrumentSearch fixture={fixture} query="SYN002" state="normal" />,
    );

    expect(markup).toContain('href="/instruments/listing_syn_0002"');
    expect(markup).toContain("星港制造");
    expect(markup).toContain("42.68");
  });

  it("preserves a no-result query and shows an explicit empty state", () => {
    const markup = renderToStaticMarkup(
      <InstrumentSearch
        fixture={readyFixture()}
        query="NOT-FOUND"
        state="normal"
      />,
    );

    expect(markup).toContain('value="NOT-FOUND"');
    expect(markup).toContain("没有找到匹配的演示标的");
  });
});
