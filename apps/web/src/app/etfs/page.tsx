import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { RealEtfCenter } from "../../features/etf-center/real-etf-center";

export const metadata: Metadata = {
  description: "沪深两市在交易的 ETF，按公开行情排名",
  title: "ETF · 火球",
};

type EtfsPageProperties = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

const firstValue = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);

/*
 * 可深链的排序。认不出来的取值回落到默认，而不是原样传下去——
 * 传下去接口会回 400，改错了地址栏的人会看到一片空白而不是一份列表。
 */
const SORTS = ["amount", "change", "volume"] as const;

type SortId = (typeof SORTS)[number];

export default async function EtfsPage({ searchParams }: EtfsPageProperties) {
  const sort = firstValue((await searchParams).sort);

  return (
    <DesktopShell>
      <RealEtfCenter
        initialSort={
          SORTS.includes(sort as SortId) ? (sort as SortId) : "amount"
        }
      />
    </DesktopShell>
  );
}
