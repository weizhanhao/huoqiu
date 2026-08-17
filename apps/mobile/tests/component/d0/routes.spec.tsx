import type * as ReactModule from "react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { D0FixtureLoadResult } from "../../../src/lib/d0-fixture";

const mocks = vi.hoisted(() => ({
  fixtureResult: {
    status: "error",
    message: "fixture unavailable",
  } as D0FixtureLoadResult,
  localSearchParameters: { listingId: "listing_syn_0001" } as Readonly<{
    listingId?: string | string[];
    portfolioId?: string | string[];
  }>,
  router: {
    back: vi.fn(),
    canGoBack: vi.fn(() => false),
    push: vi.fn(),
    replace: vi.fn(),
  },
  stateIndex: 0,
  stateSetters: [] as ReturnType<typeof vi.fn>[],
  stateValues: [] as unknown[],
}));

vi.mock("expo-router", () => ({
  useLocalSearchParams: () => mocks.localSearchParameters,
  useRouter: () => mocks.router,
}));

vi.mock("../../../src/lib/d0-fixture", () => ({
  loadD0Fixture: () => mocks.fixtureResult,
}));

vi.mock("react", async (importOriginal) => {
  const original = (await importOriginal()) as typeof ReactModule;
  return {
    ...original,
    useState: <Value,>(initial: Value | (() => Value)) => {
      const index = mocks.stateIndex;
      mocks.stateIndex += 1;
      const initialValue =
        typeof initial === "function" ? (initial as () => Value)() : initial;
      const value =
        index < mocks.stateValues.length
          ? (mocks.stateValues[index] as Value)
          : initialValue;
      const setter = vi.fn();
      mocks.stateSetters[index] = setter;
      return [value, setter] as const;
    },
  };
});

import PortfolioDetailScreen from "../../../app/portfolio/[portfolioId]";

const readProperties = (element: ReactElement) =>
  element.props as Readonly<{
    onBack?: () => void;
    detail?: Readonly<{ id: string }>;
    density?: string;
    messages?: readonly Readonly<{ id: string }>[];
    onOpenInstrument?: (listingId: string) => void;
    onOpenPortfolio?: (portfolioId: string) => void;
    onNavigate?: (
      destination: "messages" | "portfolios" | "settings" | "watchlist",
    ) => void;
    onRetry?: () => void;
    onSearch?: () => void;
    onSelectRegion?: (region: "a" | "global" | "hk" | "us") => void;
    onSelectPeriod?: (period: "day" | "week" | "year") => void;
    onSelectDensity?: (density: "comfortable" | "compact") => void;
    onSubmit?: () => void;
    query?: string;
    selectedRegion?: string;
    selectedPeriod?: string;
    submittedQuery?: string;
  }>;

beforeEach(() => {
  mocks.fixtureResult = {
    status: "error",
    message: "fixture unavailable",
  };
  mocks.localSearchParameters = { listingId: "listing_syn_0001" };
  mocks.router.back.mockReset();
  mocks.router.canGoBack.mockReset();
  mocks.router.canGoBack.mockReturnValue(false);
  mocks.router.push.mockReset();
  mocks.router.replace.mockReset();
  mocks.stateIndex = 0;
  mocks.stateSetters = [];
  mocks.stateValues = [];
});

describe("D0 mobile route behavior", () => {
  /*
   * 搜索页从这些表里去掉了。
   *
   * 它不再读夹具——联想走 /api/market/search，是真的证券代码表；「猜你想搜」
   * 是当下的实时资讯，「热门股票」是真实榜单。失败原因是网络或上游，恢复方式
   * 是重新输入，不是重新解析一份本地 JSON。「重试夹具」这条断言守的东西
   * 已经不存在。
   *
   * 「返回时深链回首页」这条不变，只是它守的是 createD0BackHandler，跟哪一页
   * 用它没关系——那条断言搬到了 tests/navigation/back-or-home.spec.ts，
   * 页面内容由 tests/component/search/ 下的用例接手。
   */

  /*
   * 行情与组合两条用例已随它们守的东西一起去掉。
   *
   * 两页原先读的是 getMarketSnapshot(region) / getPortfolioHub(period)——写死的
   * 合成快照，切「沪深/港股/美股」「日/周/年」只是在几组假数字之间来回换，
   * 用例断的正是那个本地 useState。现在两页拉的是真实接口：行情是公开行情源，
   * 组合是这个账号自己建的和关注的，没有可切换的本地档位可断。
   *
   * 新行为由 tests/component/markets/ 下的用例接手。
   */

  it("resolves a portfolio deep link and returns fresh entry to portfolios", () => {
    mocks.localSearchParameters = { portfolioId: "portfolio_syn_0001" };
    const detail = readProperties(PortfolioDetailScreen() as ReactElement);

    expect(detail.detail?.id).toBe("portfolio_syn_0001");
    detail.onBack?.();
    expect(mocks.router.replace).toHaveBeenCalledWith("/portfolios");
    expect(mocks.router.back).not.toHaveBeenCalled();

    mocks.router.replace.mockReset();
    mocks.router.canGoBack.mockReturnValue(true);
    const stacked = readProperties(PortfolioDetailScreen() as ReactElement);
    stacked.onBack?.();
    expect(mocks.router.back).toHaveBeenCalledOnce();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  /*
   * 「我的」原先是一排本地跳转入口（消息/设置/自选/组合），配一个写死的
   * 演示用户——不管谁在用，看到的都是同一个人。它现在是真实账号页：
   * 没登录给登录表单，登录了显示这个账号自己的数字。
   *
   * 那条断言跟着它守的东西一起没了。真实账号页的行为由
   * tests/component/account/profile-screen.spec.tsx 接手。
   */

  /*
   * 消息页也从这里去掉了。
   *
   * 它此前渲染三条写死的合成消息，这条用例断的正是那个 3。现在读的是
   * /api/social/notifications——服务端从真实事件推导，条数取决于真有多少人
   * 回复、点赞、@ 了你，没有可断的固定长度。
   *
   * 新行为由 tests/component/messages/ 下的用例接手。
   */

  /*
   * 设置页也从这里去掉了。
   *
   * 这条断的是一个叫「密度」的本地开关：只活在内存里，退出去再进来回到默认
   * 值，而它本来也没影响任何东西。现在这一页改成三项真设置——评论权限、
   * 消息通知、涨跌配色，都存在账号下，读写走 /api/social/privacy，没有可断的
   * 本地 useState。
   *
   * 新行为由 tests/component/settings/ 下的用例接手。
   */

  /*
   * 首页从这张表里去掉了。
   *
   * 「重试」守的是夹具加载失败这个分支，而首页已经不读夹具了——它现在拉的是
   * 真实的关注流，失败原因是网络或服务端，恢复方式是下拉刷新，不是重新解析
   * 一份本地 JSON。留在表里只会让它去证明一个不存在的分支。
   */
  /*
   * 自选也从这张表里去掉了：它不再读夹具，名单来自账号、行情按名单现取，
   * 失败原因是网络或服务端，恢复方式是下拉刷新，不是重新解析本地 JSON。
   */
});
