import { d0FixtureSchema } from "@huoqiu/contracts/d0";
import fixtureJson from "@huoqiu/contracts/d0/fixture";
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

import MarketsScreen from "../../../app/(tabs)/markets";
import PortfoliosScreen from "../../../app/(tabs)/portfolios";
import WatchlistScreen from "../../../app/(tabs)/watchlist";
import InstrumentScreen from "../../../app/instrument/[listingId]";
import MessagesScreen from "../../../app/messages";
import PortfolioDetailScreen from "../../../app/portfolio/[portfolioId]";
import SearchScreen from "../../../app/search";
import SettingsScreen from "../../../app/settings";

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

const readyFixtureResult = (): D0FixtureLoadResult => ({
  status: "ready",
  data: d0FixtureSchema.parse(fixtureJson),
});

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
  it.each([
    ["search", SearchScreen],
    ["instrument detail", InstrumentScreen],
  ] as const)(
    "returns %s fresh deep links to /home and preserves normal back history",
    (_name, Screen) => {
      mocks.fixtureResult = readyFixtureResult();
      const fresh = readProperties(Screen() as ReactElement);
      expect(fresh.onBack).toBeTypeOf("function");
      fresh.onBack?.();
      expect(mocks.router.replace).toHaveBeenCalledWith("/home");
      expect(mocks.router.back).not.toHaveBeenCalled();

      mocks.router.replace.mockReset();
      mocks.router.canGoBack.mockReturnValue(true);
      mocks.stateIndex = 0;
      const stacked = readProperties(Screen() as ReactElement);
      stacked.onBack?.();
      expect(mocks.router.back).toHaveBeenCalledOnce();
      expect(mocks.router.replace).not.toHaveBeenCalled();
    },
  );

  it("submits the current draft through the search route", () => {
    const ready = readyFixtureResult();
    mocks.fixtureResult = ready;
    mocks.stateValues = [ready, "SYN001", ""];

    const search = readProperties(SearchScreen() as ReactElement);
    expect(search.query).toBe("SYN001");
    expect(search.submittedQuery).toBe("");
    expect(search.onSubmit).toBeTypeOf("function");
    search.onSubmit?.();
    expect(mocks.stateSetters[2]).toHaveBeenCalledWith("SYN001");
  });

  it("keeps market region state and preserves search and instrument deep links", () => {
    const market = readProperties(MarketsScreen() as ReactElement);

    expect(market.selectedRegion).toBe("a");
    market.onSelectRegion?.("us");
    expect(mocks.stateSetters[0]).toHaveBeenCalledWith("us");

    market.onSearch?.();
    expect(mocks.router.push).toHaveBeenCalledWith("/search");
    market.onOpenInstrument?.("listing_syn_0001");
    expect(mocks.router.push).toHaveBeenCalledWith({
      params: { listingId: "listing_syn_0001" },
      pathname: "/instrument/[listingId]",
    });
  });

  it("keeps portfolio period state and opens the real synthetic detail route", () => {
    const portfolios = readProperties(PortfoliosScreen() as ReactElement);

    expect(portfolios.selectedPeriod).toBe("day");
    portfolios.onSelectPeriod?.("year");
    expect(mocks.stateSetters[0]).toHaveBeenCalledWith("year");

    portfolios.onSearch?.();
    expect(mocks.router.push).toHaveBeenCalledWith("/search");
    portfolios.onOpenPortfolio?.("portfolio_syn_0001");
    expect(mocks.router.push).toHaveBeenCalledWith({
      params: { portfolioId: "portfolio_syn_0001" },
      pathname: "/portfolio/[portfolioId]",
    });
  });

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

  it("renders fixed messages and returns a fresh deep link to profile", () => {
    const messages = readProperties(MessagesScreen() as ReactElement);

    expect(messages.messages).toHaveLength(3);
    messages.onBack?.();
    expect(mocks.router.replace).toHaveBeenCalledWith("/profile");
  });

  it("keeps session settings state and returns a fresh deep link to profile", () => {
    const settings = readProperties(SettingsScreen() as ReactElement);

    expect(settings.density).toBe("comfortable");
    settings.onSelectDensity?.("compact");
    expect(mocks.stateSetters[0]).toHaveBeenCalledWith("compact");
    settings.onBack?.();
    expect(mocks.router.replace).toHaveBeenCalledWith("/profile");
  });

  /*
   * 首页从这张表里去掉了。
   *
   * 「重试」守的是夹具加载失败这个分支，而首页已经不读夹具了——它现在拉的是
   * 真实的关注流，失败原因是网络或服务端，恢复方式是下拉刷新，不是重新解析
   * 一份本地 JSON。留在表里只会让它去证明一个不存在的分支。
   */
  it.each([
    ["watchlist", WatchlistScreen, false],
    ["search", SearchScreen, true],
    ["instrument detail", InstrumentScreen, true],
  ] as const)(
    "wires a recovering Retry for the %s error branch without dropping stack navigation",
    (_name, Screen, needsBack) => {
      const error = readProperties(Screen() as ReactElement);
      expect(error.onRetry).toBeTypeOf("function");
      if (needsBack) {
        expect(error.onBack).toBeTypeOf("function");
      }

      const ready = readyFixtureResult();
      mocks.fixtureResult = ready;
      error.onRetry?.();
      expect(mocks.stateSetters[0]).toHaveBeenCalledWith(ready);
    },
  );
});
