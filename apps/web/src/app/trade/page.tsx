import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { PaperTradingDesk } from "../../features/market-portfolio/paper-trading-desk";

/*
 * 模拟交易。
 *
 * 雪球顶栏的「交易」是券商对接，需要牌照与真实资金通道，做不了；
 * 但它同样有「模拟交易」，那个能真做——价格用真实行情，盈亏照真实价格算。
 */

export const metadata: Metadata = {
  description: "用真实行情记录虚拟买卖，不涉及真实资金",
  title: "模拟交易 · 火球",
};

export default function TradeRoute() {
  return (
    <DesktopShell activeUtility="profile">
      <PaperTradingDesk />
    </DesktopShell>
  );
}
