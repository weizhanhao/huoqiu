import { describe, expect, it } from "vitest";

import {
  financeInformationItems,
  queryFinanceInformation,
} from "../../src/features/finance-information/finance-information-fixtures";

describe("finance information fixture registry", () => {
  it("covers every promised content type with absolute synthetic timestamps", () => {
    expect(financeInformationItems.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["brief", "company", "announcement", "column"]),
    );
    expect(financeInformationItems.every((item) => item.synthetic)).toBe(true);
    expect(
      financeInformationItems.every((item) =>
        /^2026-08-\d{2} \d{2}:\d{2} CST$/u.test(item.publishedLabel),
      ),
    ).toBe(true);
  });

  it("filters the fixed registry by public channel and local title or listing text", () => {
    expect(
      queryFinanceInformation({ channel: "company", query: "星港" }).map(
        (item) => item.id,
      ),
    ).toEqual(["company_syn_starport_orders"]);
    expect(
      queryFinanceInformation({ channel: "all", query: "不存在的标的" }),
    ).toEqual([]);
  });
});
