import { MarketIndexStrip } from "../shell/market-index-strip";

/*
 * 兼容旧首页导入。行情只使用同事已接好的服务端真实数据组件，
 * 这里不再发起第二套请求，也不构造加载期行情。
 */
export function HomeRealIndexCarousel() {
  return <MarketIndexStrip />;
}
