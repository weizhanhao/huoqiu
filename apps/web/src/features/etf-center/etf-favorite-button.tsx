"use client";

import { useSyncExternalStore } from "react";

const favoriteEtfIds = new Set<string>();
const favoriteListeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  favoriteListeners.add(listener);
  return () => favoriteListeners.delete(listener);
};

const emitFavoriteChange = () => {
  for (const listener of favoriteListeners) listener();
};

export function EtfFavoriteButton({ etfId }: Readonly<{ etfId: string }>) {
  const isFavorite = useSyncExternalStore(
    subscribe,
    () => favoriteEtfIds.has(etfId),
    () => false,
  );

  const toggleFavorite = () => {
    if (favoriteEtfIds.has(etfId)) favoriteEtfIds.delete(etfId);
    else favoriteEtfIds.add(etfId);
    emitFavoriteChange();
  };

  return (
    <button aria-pressed={isFavorite} onClick={toggleFavorite} type="button">
      {isFavorite ? "已收藏 ETF" : "收藏 ETF"}
    </button>
  );
}
