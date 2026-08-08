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

import HomeScreen from "../../../app/(tabs)/home";
import WatchlistScreen from "../../../app/(tabs)/watchlist";
import InstrumentScreen from "../../../app/instrument/[listingId]";
import SearchScreen from "../../../app/search";

const readProperties = (element: ReactElement) =>
  element.props as Readonly<{
    onBack?: () => void;
    onRetry?: () => void;
    onSubmit?: () => void;
    query?: string;
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

  it.each([
    ["home", HomeScreen, false],
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
