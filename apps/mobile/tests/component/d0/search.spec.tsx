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
    "合成示例一号",
    "hechengshili",
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

    expect(result).toContain("合成示例一号");
    expect(result).toContain("SYN001");
    expect(result).toContain("listing_syn_0001");
    expect(empty).toContain("没有找到匹配的演示标的");
    expect(empty).toContain("NOT-FOUND");
  });
});
