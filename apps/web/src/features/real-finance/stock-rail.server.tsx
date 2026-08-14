import { StockRail } from "../../components/instrument/stock-rail";
import { loadCompanyProfile, loadShareholders } from "../../server/f10.server";
import { loadSectorPeers } from "../../server/sector-peers.server";

/*
 * 个股页右栏的取数与渲染。
 *
 * 抽出来是为了让行情主页和它下面的每个分区页用同一份——两条路由的
 * 栏目数必须一致，否则居中容器的宽度不同，左侧导航会在切换分区时
 * 水平跳一下。那种跳动没有任何信息，只让人觉得页面没做完。
 *
 * 三路互不依赖，并行发出；任何一路取不到就少一块，三块都没有时
 * StockRail 自己整栏不渲染。
 */
/*
 * 取不到就说取不到，不要伪装成「本来就没有」。
 *
 * 三路原先都是 .catch(() => null)——于是「长鑫科技确实没有基金持股」
 * （2024 年上市，公募季报里还没披露）和「F10 接口挂了」在界面上完全
 * 一样：那一块都不出现。查原始返回才分得出来，用户永远分不出来。
 *
 * 现在把「拿到了、是空的」和「没拿到」分开：前者不渲染那一块（如实），
 * 后者渲染一句取不到（也如实）。
 */
const settle = async <T,>(work: Promise<T>): Promise<T | "failed"> => {
  try {
    return await work;
  } catch {
    return "failed";
  }
};

/*
 * 自己取数、自己渲染的右栏。
 *
 * 改成组件而不是「返回 JSX 的取数函数」，是为了能被 Suspense 包住：
 * 此前它在 layout 里被 await，于是 F10、同板块、基金持仓这三路——最慢、
 * 最容易超时、也最不重要的三路——正卡着整页的首字节。用户来看的是价格，
 * 却要等公司简介。
 *
 * 挪进 Suspense 之后，首字节由报价那一路决定，右栏自己慢慢来。
 */
export async function StockRailSection({
  symbol,
}: Readonly<{ symbol: string }>) {
  const [profileResult, peersResult, holdersResult] = await Promise.all([
    settle(loadCompanyProfile(symbol)),
    settle(loadSectorPeers(symbol)),
    settle(loadShareholders(symbol)),
  ]);

  const profile = profileResult === "failed" ? null : profileResult;
  const peers = peersResult === "failed" ? null : peersResult;
  const shareholders = holdersResult === "failed" ? null : holdersResult;
  return (
    <StockRail
      failed={{
        peers: peersResult === "failed",
        profile: profileResult === "failed",
        shareholders: holdersResult === "failed",
      }}
      fundHoldings={shareholders?.fundHoldings ?? []}
      profile={profile?.profile ?? null}
      sectorPeers={peers}
    />
  );
}
