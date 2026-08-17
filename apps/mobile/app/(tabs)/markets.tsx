import { fetchMarketOverview } from "../../src/api/market-api";
import { MarketScreen } from "../../src/components/markets/market-screen";
import { useRemote } from "../../src/hooks/use-remote";

/*
 * 行情。
 *
 * 这里原先渲染的是 getMarketSnapshot(region)——一份写死的合成快照，切「沪深/
 * 港股/美股」只是在几组假数字之间来回换。现在拉的是公开行情源的真实数据。
 */
export default function MarketsScreen() {
  const { failure, loading, refresh, value } = useRemote(fetchMarketOverview);

  return (
    <MarketScreen
      failure={failure}
      loading={loading}
      onRefresh={refresh}
      overview={value}
    />
  );
}
