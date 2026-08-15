"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import {
  readBrowserStore,
  useBrowserStore,
  writeBrowserStore,
} from "../lib/browser-store";
import { isWatchableSymbol } from "../lib/watchlist-symbol";

/*
 * 自选存进浏览器，不再只活在内存里。
 *
 * 原先它是纯内存态：刷新一次、或者从个股页整页跳到自选页，加过的东西就没了。
 * 用户加完自选、走到自选页，看到的是「还没有自选」——他没做错任何事。
 *
 * 存在浏览器里而不是账号里，是因为这一层本来就是「未登录也能用」的；
 * 登录后的跨设备同步是另一件事，需要服务端的自选表。
 */
const STORAGE_KEY = "huoqiu.watchlist.v1";

const parseStored = (raw: string | null): readonly string[] => {
  if (raw === null) return EMPTY_IDS;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : EMPTY_IDS;
  } catch {
    return EMPTY_IDS;
  }
};

/* 模块级常量：每次返回新数组会让存储快照的比对判定为「变了」。 */
const EMPTY_IDS: readonly string[] = [];

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

/*
 * 下一份清单由既有的 reducer 算出来——它是纯函数，规则（去重、顺序、
 * 重置）只写一遍，存储这一层只负责读写。
 */
const current = (): D0WatchlistState => ({
  listingIds: parseStored(readBrowserStore(STORAGE_KEY)),
});

const write = (next: D0WatchlistState): void => {
  writeBrowserStore(STORAGE_KEY, JSON.stringify(next.listingIds));
};

export function D0WatchlistProvider({
  children,
  knownListingIds,
  initialListingIds = d0WatchlistInitialState.listingIds,
}: D0WatchlistProviderProperties) {
  const stored = useBrowserStore(STORAGE_KEY, parseStored, EMPTY_IDS);
  /*
   * 服务端与首帧拿到的是空列表（存储只有浏览器有），水合之后换成真实清单——
   * useBrowserStore 的服务端快照就是为这件事准备的，中间不经过多余的一帧。
   */
  const state = useMemo(
    () => ({ listingIds: stored.length > 0 ? stored : initialListingIds }),
    [initialListingIds, stored],
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
        write(d0WatchlistReducer(current(), { type: "add", listingId }));
      }
    },
    [knownListingIdSet],
  );
  const remove = useCallback((listingId: string) => {
    write(d0WatchlistReducer(current(), { type: "remove", listingId }));
  }, []);
  const has = useCallback(
    (listingId: string) => state.listingIds.includes(listingId),
    [state.listingIds],
  );
  const reset = useCallback(() => {
    write(d0WatchlistInitialState);
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
