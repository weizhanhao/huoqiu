"use client";

import { useCallback } from "react";

import {
  readBrowserStore,
  useBrowserStore,
  writeBrowserStore,
} from "../lib/browser-store";

export const FUND_WATCHLIST_STORAGE_KEY = "huoqiu.fund-watchlist.v1";
const EMPTY_CODES: readonly string[] = [];

export const parseFundWatchlist = (raw: string | null): readonly string[] => {
  if (raw === null) return EMPTY_CODES;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return EMPTY_CODES;
    return [
      ...new Set(
        value.filter(
          (entry): entry is string =>
            typeof entry === "string" && /^\d{6}$/.test(entry),
        ),
      ),
    ];
  } catch {
    return EMPTY_CODES;
  }
};

const current = (): readonly string[] =>
  parseFundWatchlist(readBrowserStore(FUND_WATCHLIST_STORAGE_KEY));

const write = (codes: readonly string[]): void => {
  writeBrowserStore(FUND_WATCHLIST_STORAGE_KEY, JSON.stringify(codes));
};

export function useFundWatchlist() {
  const codes = useBrowserStore(
    FUND_WATCHLIST_STORAGE_KEY,
    parseFundWatchlist,
    EMPTY_CODES,
  );
  const add = useCallback((code: string) => {
    if (!/^\d{6}$/.test(code)) return;
    write([...new Set([...current(), code])]);
  }, []);
  const addMany = useCallback((newCodes: readonly string[]) => {
    write([
      ...new Set([
        ...current(),
        ...newCodes.filter((code) => /^\d{6}$/.test(code)),
      ]),
    ]);
  }, []);
  const remove = useCallback((code: string) => {
    write(current().filter((candidate) => candidate !== code));
  }, []);
  const has = useCallback((code: string) => codes.includes(code), [codes]);

  return { add, addMany, codes, has, remove } as const;
}
