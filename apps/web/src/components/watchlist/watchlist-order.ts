/*
 * 自选的自定义顺序。
 *
 * 此前只有四种预置排序（添加顺序 / 涨幅 / 跌幅 / 名称），用户没法把自己
 * 最关心的几个标的置顶——那是自选列表最基本的诉求。
 *
 * 实现成「上移 / 下移」而不是拖拽，是有意的：
 * 拖拽在触屏上要和页面滚动抢手势，键盘用户则完全没法操作。上移下移用的
 * 是普通按钮，键盘、读屏、触屏都能用，也不需要额外的无障碍适配。
 *
 * 顺序写进 localStorage，刷新和重开浏览器都还在。
 */

import { readBrowserStore, writeBrowserStore } from "../../lib/browser-store";

export const ORDER_STORAGE_KEY = "huoqiu.watchlist-order.v1";

/* 模块级常量：每次返回一个新数组会让存储快照的比对判定为「变了」。 */
export const NO_ORDER: readonly string[] = [];

export const parseCustomOrder = (raw: string | null): readonly string[] => {
  if (raw === null) return NO_ORDER;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : NO_ORDER;
  } catch {
    return NO_ORDER;
  }
};

export const readCustomOrder = (): readonly string[] =>
  parseCustomOrder(readBrowserStore(ORDER_STORAGE_KEY));

export const writeCustomOrder = (order: readonly string[]): void => {
  writeBrowserStore(ORDER_STORAGE_KEY, JSON.stringify(order));
};

/*
 * 按自定义顺序排列。
 *
 * 不在 order 里的标的排在后面并保持原有相对顺序——新加入自选的标的不该
 * 因为「还没被排过」就消失或跳到最前面。
 */
export const applyCustomOrder = <T extends { listingId: string }>(
  entries: readonly T[],
  order: readonly string[],
): readonly T[] => {
  const rank = new Map(order.map((listingId, index) => [listingId, index]));
  return entries
    .map((entry, index) => ({ entry, index }))
    .toSorted((left, right) => {
      const leftRank = rank.get(left.entry.listingId);
      const rightRank = rank.get(right.entry.listingId);
      if (leftRank === undefined && rightRank === undefined) {
        return left.index - right.index;
      }
      if (leftRank === undefined) return 1;
      if (rightRank === undefined) return -1;
      return leftRank - rightRank;
    })
    .map(({ entry }) => entry);
};

/** 把某个标的在当前顺序里前移或后移一位。 */
export const moveWithin = (
  order: readonly string[],
  listingId: string,
  direction: -1 | 1,
): readonly string[] => {
  const current = order.includes(listingId)
    ? [...order]
    : [...order, listingId];
  const from = current.indexOf(listingId);
  const to = from + direction;
  if (to < 0 || to >= current.length) {
    return current;
  }
  const next = [...current];
  const moved = next[from] as string;
  next[from] = next[to] as string;
  next[to] = moved;
  return next;
};
