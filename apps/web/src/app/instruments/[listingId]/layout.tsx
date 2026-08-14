import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { StockShell } from "../../../components/shell/stock-shell";
import { WatchlistToggle } from "../../../components/watchlist/watchlist-toggle";
import { resolveListing } from "../../../features/real-finance/resolve-listing.server";
import { StockRailSection } from "../../../features/real-finance/stock-rail.server";
import { StockRailSkeleton } from "../../../components/instrument/skeleton";

/*
 * 个股页的外壳，管住 /instruments/[代码] 以下的每一条子路由。
 *
 * 提到 layout 是这一版最要紧的一处结构改动。App Router 里共享 layout 在
 * 子路由段之间切换时**不会重新渲染、也不会重新挂载**——于是顶栏、左侧
 * 分区导航、标题行在整个切换过程中始终是同一批 DOM 节点。
 *
 * 此前外壳长在每个 page 里：点一次「公司简介」，导航是一组全新的节点，
 * 容器宽度稍有不同就是一次硬跳。那时我是靠「把两处 max-width 对齐」去
 * 缓解的，而只要还有两份，迟早再漂移一次。放进 layout 之后，位置跳变
 * 在物理层面不成立，不再依赖两处数值保持一致。
 *
 * 顺带解锁分段骨架：loading.tsx 放在子路由段上时，只有正文那一列会被
 * 换成骨架，顶栏和导航岿然不动。
 */

export default async function InstrumentLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<Readonly<{ listingId: string }>>;
}>) {
  const { listingId } = await params;

  /*
   * resolveListing 被 React.cache 包着：这里和 page、generateMetadata
   * 要的是同一份，同一次渲染里只打一次上游。
   */
  const listing = await resolveListing(listingId);
  if (listing === null) notFound();

  /*
   * 右栏不 await。
   *
   * F10、同板块、基金持仓是最慢、最容易超时、也最不重要的三路——此前它们
   * 挂在这里被 await，正卡着整页的首字节：用户来看价格，却要等公司简介。
   * 包进 Suspense 之后，首字节由报价那一路决定。
   */
  return (
    <StockShell
      actions={<WatchlistToggle listingId={listing.symbol} />}
      name={listing.name}
      rail={
        <Suspense fallback={<StockRailSkeleton />}>
          <StockRailSection symbol={listing.symbol} />
        </Suspense>
      }
      symbol={listing.symbol}
    >
      {children}
    </StockShell>
  );
}
