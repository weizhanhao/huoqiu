import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { RealFundCenter } from "../../features/fund-center/real-fund-center";

export const metadata: Metadata = {
  description: "真实公募基金排行、净值与各期收益",
  title: "基金 · 火球",
};

type FundsPageProperties = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

const firstValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/*
 * 可深链的分类与排序。
 *
 * 认不出来的取值回落到默认，而不是原样传下去——传下去接口会回 400，
 * 一个改错了地址栏的人会看到一片空白而不是一份基金列表。
 */
const CATEGORIES = ["hybrid", "stock", "index", "bond", "qdii"] as const;
const SORTS = ["oneYear", "threeYear", "yearToDate", "day"] as const;

type CategoryId = (typeof CATEGORIES)[number];
type SortId = (typeof SORTS)[number];

export default async function FundsPage({ searchParams }: FundsPageProperties) {
  const parameters = await searchParams;
  const category = firstValue(parameters.category);
  const sort = firstValue(parameters.sort);

  return (
    <DesktopShell>
      <RealFundCenter
        initialCategory={
          CATEGORIES.includes(category as CategoryId)
            ? (category as CategoryId)
            : "hybrid"
        }
        initialSort={
          SORTS.includes(sort as SortId) ? (sort as SortId) : "oneYear"
        }
      />
    </DesktopShell>
  );
}
