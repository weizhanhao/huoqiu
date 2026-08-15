"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import { isWatchableSymbol } from "../lib/watchlist-symbol";

export type D0WatchlistState = Readonly<{
  listingIds: readonly string[];
}>;

export type D0WatchlistAction =
  | Readonly<{ type: "add"; listingId: string }>
  | Readonly<{ type: "remove"; listingId: string }>
  | Readonly<{ type: "reset" }>;

export const d0WatchlistInitialState: D0WatchlistState = Object.freeze({
  listingIds: Object.freeze([]),
});

export const createD0WatchlistState = (
  initialListingIds: readonly string[],
  knownListingIds: readonly string[],
): D0WatchlistState => {
  const knownListingIdSet = new Set(knownListingIds);
  return {
    listingIds: [
      ...new Set(
        initialListingIds.filter((listingId) =>
          knownListingIdSet.has(listingId),
        ),
      ),
    ],
  };
};

export const d0WatchlistReducer = (
  state: D0WatchlistState,
  action: D0WatchlistAction,
): D0WatchlistState => {
  switch (action.type) {
    case "add": {
      if (state.listingIds.includes(action.listingId)) {
        return state;
      }
      return { listingIds: [...state.listingIds, action.listingId] };
    }
    case "remove": {
      if (!state.listingIds.includes(action.listingId)) {
        return state;
      }
      return {
        listingIds: state.listingIds.filter(
          (listingId) => listingId !== action.listingId,
        ),
      };
    }
    case "reset":
      return d0WatchlistInitialState;
  }
};

type D0WatchlistContextValue = Readonly<{
  listingIds: readonly string[];
  add: (listingId: string) => void;
  remove: (listingId: string) => void;
  has: (listingId: string) => boolean;
  reset: () => void;
}>;

const D0WatchlistContext = createContext<D0WatchlistContextValue | null>(null);

type D0WatchlistProviderProperties = Readonly<{
  children: ReactNode;
  knownListingIds: readonly string[];
  initialListingIds?: readonly string[];
}>;

export function D0WatchlistProvider({
  children,
  knownListingIds,
  initialListingIds = d0WatchlistInitialState.listingIds,
}: D0WatchlistProviderProperties) {
  const [state, dispatch] = useReducer(
    d0WatchlistReducer,
    createD0WatchlistState(initialListingIds, knownListingIds),
  );
  const knownListingIdSet = useMemo(
    () => new Set(knownListingIds),
    [knownListingIds],
  );
  const add = useCallback(
    (listingId: string) => {
      /*
       * 判据是「这个代码站内开得出页面吗」，不是「在不在那份名单里」。
       *
       * 名单原先取自本地 K 线快照——只有 8 条，而且住在 .runtime/ 下、不随
       * 代码提交。装到服务器上快照不存在、名单为空，于是每一只股票的加自选
       * 都点不动，还不报错。个股页现在按需现取，沪深港美都开得出来。
       *
       * 显式名单保留：夹具标的（listing_syn_*）不是真实代码，形状判定认不出
       * 它们，但测试与演示页面仍要能加。
       */
      if (isWatchableSymbol(listingId) || knownListingIdSet.has(listingId)) {
        dispatch({ type: "add", listingId });
      }
    },
    [knownListingIdSet],
  );
  const remove = useCallback((listingId: string) => {
    dispatch({ type: "remove", listingId });
  }, []);
  const has = useCallback(
    (listingId: string) => state.listingIds.includes(listingId),
    [state.listingIds],
  );
  const reset = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);
  const value = useMemo(
    () => ({ listingIds: state.listingIds, add, remove, has, reset }),
    [add, has, remove, reset, state.listingIds],
  );

  return (
    <D0WatchlistContext.Provider value={value}>
      {children}
    </D0WatchlistContext.Provider>
  );
}

export const useD0Watchlist = (): D0WatchlistContextValue => {
  const value = useContext(D0WatchlistContext);
  if (value === null) {
    throw new Error("useD0Watchlist must be used inside D0WatchlistProvider");
  }
  return value;
};
