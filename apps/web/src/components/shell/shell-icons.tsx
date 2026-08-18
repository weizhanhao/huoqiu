import type { ReactNode } from "react";

export type ShellIconName =
  | "fund"
  | "home"
  | "market"
  | "portfolio"
  | "private"
  | "profile"
  | "publish"
  | "search"
  | "settings"
  | "support"
  | "studio"
  | "watchlist";

type ShellIconProperties = Readonly<{
  name: ShellIconName;
}>;

const paths: Readonly<Record<ShellIconName, ReactNode>> = {
  fund: (
    <>
      <rect x="3.5" y="5" width="17" height="14.5" rx="2.2" />
      <path d="M7 9.2h10M7 13h3.2M13 13h4M7 16.6h6" />
    </>
  ),
  home: (
    <>
      <path d="M3.5 11.2 12 4l8.5 7.2" />
      <path d="M5.8 10.2V20h12.4v-9.8M9.6 20v-5.6h4.8V20" />
    </>
  ),
  market: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="m7 15 3.4-3.5 3 2.2L19 7.8" />
      <path d="M15.8 7.8H19V11" />
    </>
  ),
  portfolio: (
    <>
      <rect x="3.5" y="6.5" width="17" height="13" rx="2" />
      <path d="M8 6.5V4.8h8v1.7M3.5 11h17M9.5 11v2h5v-2" />
    </>
  ),
  private: (
    <>
      <path d="m12 3 8 5.2-8 12.8L4 8.2 12 3Z" />
      <path d="M9 9.5h6M10.5 13h3" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.2 20c.5-4 3-6.1 6.8-6.1s6.3 2.1 6.8 6.1" />
    </>
  ),
  publish: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.2" />
      <path d="m15.2 15.2 4.2 4.2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14.8a1.7 1.7 0 0 0 .3 1.9l.1.1-3 3-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2H9.6V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-3-3 .1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1h-.2V9.6h.2A1.7 1.7 0 0 0 4 8a1.7 1.7 0 0 0-.3-1.9L3.6 6l3-3 .1.1A1.7 1.7 0 0 0 8.6 3a1.7 1.7 0 0 0 1-1.6v-.2h4.2v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 3 3-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4.2H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  support: (
    <>
      <path d="M4.8 13.2v-2.4a7.2 7.2 0 0 1 14.4 0v2.4" />
      <path d="M4.8 13.2H3.6v4.6h3.2v-4.6h-2ZM19.2 13.2h1.2v4.6h-3.2v-4.6h2Z" />
      <path d="M17.2 18c-.8 1.6-2.3 2.4-4.5 2.4" />
    </>
  ),
  studio: (
    <>
      <path d="m5 19 1.2-5.1L15.7 4.4a2 2 0 0 1 2.9 0l1 1a2 2 0 0 1 0 2.9l-9.5 9.5L5 19Z" />
      <path d="m14.3 5.8 3.9 3.9M6.2 13.9l3.9 3.9" />
    </>
  ),
  watchlist: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
};

export function ShellIcon({ name }: ShellIconProperties) {
  return (
    <svg aria-hidden="true" className="shell-icon" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

export function BrandGlyph() {
  return (
    <svg aria-hidden="true" className="brand-glyph" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="17.5" />
      <path d="M11.5 13.2c4.6 0 8.5 3.4 8.5 7.7 0 4.2 3.5 7.7 8.1 7.7" />
      <path d="M28.5 13.2c-4.6 0-8.5 3.4-8.5 7.7 0 4.2-3.5 7.7-8.1 7.7" />
    </svg>
  );
}
