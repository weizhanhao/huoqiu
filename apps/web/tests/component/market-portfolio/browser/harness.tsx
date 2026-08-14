import { cssVariables } from "@huoqiu/web-ui";
import { createRoot } from "react-dom/client";

import { WatchlistPanel } from "../../../../src/components/watchlist/watchlist-panel";
import { loadD0Fixture } from "../../../../src/lib/d0-fixture";
import { D0WatchlistProvider } from "../../../../src/stores/d0-watchlist";
import { WatchlistGroupsProvider } from "../../../../src/stores/watchlist-groups";

import "../../../../src/app/globals.css";

/*
 * 真实浏览器里的自选交互。
 *
 * 这个 harness 此前还挂着三块样本界面：行情看板、涨跌榜、虚构标的详情。
 * 三者的数据全是写死的常量——切市场、切榜单都有反应，但每一行都不是真的。
 * 它们已经从站内删掉了：行情与榜单改成了公开行情接口，标的详情只服务
 * 真实代码。
 *
 * 剩下的自选面板是纯前端交互（增删、排序、分组），没有取数，
 * 正适合放在真实浏览器里验。
 */

const fixtureResult = loadD0Fixture();
if (fixtureResult.status !== "ready") {
  throw new Error("Expected the checked-in D0 fixture to parse");
}
const root = document.querySelector("#root");
if (root === null) {
  throw new Error("Expected the browser harness root element");
}

const knownListingIds = fixtureResult.data.instruments.map(
  (instrument) => instrument.listing_id,
);

/*
 * Provider 要和根布局一致。
 *
 * 少了 WatchlistGroupsProvider，分组按钮点了不会有任何反应——
 * 那是这个 harness 缺东西，不是产品的行为，而测试会把它当成后者。
 */
createRoot(root).render(
  <D0WatchlistProvider knownListingIds={knownListingIds}>
    <WatchlistGroupsProvider>
      <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
      <div data-testid="watchlist">
        <WatchlistPanel />
      </div>
    </WatchlistGroupsProvider>
  </D0WatchlistProvider>,
);
