"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/*
 * 自选分组与排序。
 *
 * 刻意不改 D0WatchlistState 的形状——它只管「哪些标的被自选了」，
 * 已有一整套测试钉着。分组是叠在它之上的一层视图状态：
 * 标的归属于哪个分组、列表怎么排序。两者解耦，加分组不会动到加自选的语义。
 *
 * 仅本次会话有效，刷新重置，与站内其他会话态一致。
 */

export const DEFAULT_GROUP = "全部";

export type WatchlistSort = "added" | "changeAsc" | "changeDesc" | "name";

export const watchlistSortOptions: readonly Readonly<{
  id: WatchlistSort;
  label: string;
}>[] = [
  { id: "added", label: "添加顺序" },
  { id: "changeDesc", label: "涨幅优先" },
  { id: "changeAsc", label: "跌幅优先" },
  { id: "name", label: "名称" },
];

type WatchlistGroupsValue = Readonly<{
  activeGroup: string;
  assign: (listingId: string, group: string) => void;
  /** 分组名 → 该组内的标的 id。`全部` 不在此表中，它是所有自选的并集。 */
  assignments: Readonly<Record<string, readonly string[]>>;
  createGroup: (name: string) => string | null;
  groupOf: (listingId: string) => string;
  groups: readonly string[];
  setActiveGroup: (group: string) => void;
  setSort: (sort: WatchlistSort) => void;
  sort: WatchlistSort;
}>;

const WatchlistGroupsContext = createContext<WatchlistGroupsValue | null>(null);

const MAX_GROUPS = 8;
const MAX_GROUP_NAME = 12;

export function WatchlistGroupsProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [groups, setGroups] = useState<readonly string[]>([DEFAULT_GROUP]);
  const [assignments, setAssignments] = useState<
    Readonly<Record<string, readonly string[]>>
  >({});
  const [activeGroup, setActiveGroup] = useState(DEFAULT_GROUP);
  const [sort, setSort] = useState<WatchlistSort>("added");

  const createGroup = useCallback(
    (rawName: string): string | null => {
      const name = rawName.trim();
      if (name.length === 0) return "请输入分组名称。";
      if (name.length > MAX_GROUP_NAME) {
        return `分组名称不超过 ${MAX_GROUP_NAME} 个字符。`;
      }
      if (groups.includes(name)) return "该分组已存在。";
      if (groups.length >= MAX_GROUPS) {
        return `最多创建 ${MAX_GROUPS - 1} 个自定义分组。`;
      }
      setGroups((current) => [...current, name]);
      return null;
    },
    [groups],
  );

  const assign = useCallback((listingId: string, group: string) => {
    setAssignments((current) => {
      // 一个标的同时只属于一个分组，先从所有组里摘掉再放进目标组。
      const cleared = Object.fromEntries(
        Object.entries(current).map(([name, ids]) => [
          name,
          ids.filter((id) => id !== listingId),
        ]),
      );
      if (group === DEFAULT_GROUP) return cleared;
      return {
        ...cleared,
        [group]: [...(cleared[group] ?? []), listingId],
      };
    });
  }, []);

  const groupOf = useCallback(
    (listingId: string): string =>
      Object.entries(assignments).find(([, ids]) =>
        ids.includes(listingId),
      )?.[0] ?? DEFAULT_GROUP,
    [assignments],
  );

  const value = useMemo<WatchlistGroupsValue>(
    () => ({
      activeGroup,
      assign,
      assignments,
      createGroup,
      groupOf,
      groups,
      setActiveGroup,
      setSort,
      sort,
    }),
    [activeGroup, assign, assignments, createGroup, groupOf, groups, sort],
  );

  return (
    <WatchlistGroupsContext.Provider value={value}>
      {children}
    </WatchlistGroupsContext.Provider>
  );
}

/** Provider 缺失时返回只读的默认视图，避免独立挂载的测试 harness 被拖垮。 */
export function useWatchlistGroups(): WatchlistGroupsValue {
  const value = useContext(WatchlistGroupsContext);
  return (
    value ?? {
      activeGroup: DEFAULT_GROUP,
      assign: () => undefined,
      assignments: {},
      createGroup: () => null,
      groupOf: () => DEFAULT_GROUP,
      groups: [DEFAULT_GROUP],
      setActiveGroup: () => undefined,
      setSort: () => undefined,
      sort: "added",
    }
  );
}
