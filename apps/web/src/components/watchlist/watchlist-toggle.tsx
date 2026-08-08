"use client";

import { useD0Watchlist } from "../../stores/d0-watchlist";

type WatchlistToggleProperties = Readonly<{
  listingId: string;
  removeLabel?: string;
}>;

export function WatchlistToggle({
  listingId,
  removeLabel = "已加自选",
}: WatchlistToggleProperties) {
  const { add, has, remove } = useD0Watchlist();
  const isIncluded = has(listingId);

  return (
    <button
      aria-label={isIncluded ? "取消自选" : "加自选"}
      aria-pressed={isIncluded}
      className="watchlist-toggle"
      onClick={() => {
        if (isIncluded) {
          remove(listingId);
        } else {
          add(listingId);
        }
      }}
      type="button"
    >
      {isIncluded ? removeLabel : "加自选"}
    </button>
  );
}
