"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type HomeView = "feed" | "watchlist";
export type HomeOptionalType = "fund" | "portfolio" | "stock";
export type HomeOptionalEntry = Readonly<{
  change: string;
  direction: "down" | "up";
  label: string;
  name: string;
  symbol: string;
  type: HomeOptionalType;
  value: string;
}>;

type HomeViewContextValue = Readonly<{
  addOptionalEntry: (entry: HomeOptionalEntry) => void;
  addOptionalType: (type: HomeOptionalType) => void;
  addedOptionalEntries: readonly HomeOptionalEntry[];
  addedOptionalTypes: ReadonlySet<HomeOptionalType>;
  dismissOptionalType: (type: HomeOptionalType) => void;
  dismissedOptionalTypes: ReadonlySet<HomeOptionalType>;
  setView: (view: HomeView) => void;
  view: HomeView;
}>;

const HomeViewContext = createContext<HomeViewContextValue | null>(null);

export function HomeViewProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [addedOptionalEntries, setAddedOptionalEntries] = useState<
    readonly HomeOptionalEntry[]
  >([]);
  const [addedOptionalTypes, setAddedOptionalTypes] = useState<
    ReadonlySet<HomeOptionalType>
  >(new Set());
  const [dismissedOptionalTypes, setDismissedOptionalTypes] = useState<
    ReadonlySet<HomeOptionalType>
  >(new Set());
  const [view, setView] = useState<HomeView>("feed");
  const value = useMemo(
    () => ({
      addOptionalEntry: (entry: HomeOptionalEntry) => {
        setAddedOptionalEntries((current) =>
          current.some(
            (candidate) =>
              candidate.type === entry.type &&
              candidate.symbol === entry.symbol,
          )
            ? current
            : [entry, ...current],
        );
      },
      addOptionalType: (type: HomeOptionalType) => {
        setAddedOptionalTypes((current) => new Set(current).add(type));
        setDismissedOptionalTypes((current) => {
          const next = new Set(current);
          next.delete(type);
          return next;
        });
      },
      addedOptionalEntries,
      addedOptionalTypes,
      dismissOptionalType: (type: HomeOptionalType) => {
        setDismissedOptionalTypes((current) => new Set(current).add(type));
      },
      dismissedOptionalTypes,
      setView,
      view,
    }),
    [addedOptionalEntries, addedOptionalTypes, dismissedOptionalTypes, view],
  );

  return (
    <HomeViewContext.Provider value={value}>
      {children}
    </HomeViewContext.Provider>
  );
}

export function useOptionalHomeView(): HomeViewContextValue | null {
  return useContext(HomeViewContext);
}
