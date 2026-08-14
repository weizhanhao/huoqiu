import type { Metadata } from "next";

import { MarketColorsPanel } from "../../../features/profile-settings/market-colors-panel";

export const metadata: Metadata = {
  description: "选择红涨绿跌或绿涨红跌",
  title: "股票设置 · 火球",
};

export default function SettingsMarketPage() {
  return <MarketColorsPanel />;
}
