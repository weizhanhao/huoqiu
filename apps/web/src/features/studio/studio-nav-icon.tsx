import type { ReactNode } from "react";

export type StudioNavIconName =
  | "article"
  | "benefit"
  | "chart"
  | "content"
  | "discussion"
  | "draft"
  | "home"
  | "table"
  | "users"
  | "verify";

const paths: Readonly<Record<StudioNavIconName, ReactNode>> = {
  article: (
    <>
      <path d="M5 4.5h10l4 4V20H5V4.5Z" />
      <path d="M15 4.5v4h4M8 12h8M8 15.5h6" />
    </>
  ),
  benefit: (
    <>
      <path d="M12 3.5 20 7v5.2c0 4.2-3.1 7.1-8 8.3-4.9-1.2-8-4.1-8-8.3V7l8-3.5Z" />
      <path d="m8.6 12 2.1 2.1 4.7-4.7" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V5M4 20h16" />
      <path d="m7 16 3.2-3.4 2.8 2 5-6" />
    </>
  ),
  content: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  discussion: (
    <>
      <path d="M5 5h14v10H9l-4 4V5Z" />
      <path d="M8 9h8M8 12h5" />
    </>
  ),
  draft: (
    <>
      <path d="M5 4.5h10l4 4V20H5V4.5Z" />
      <path d="M15 4.5v4h4M8 12h5M8 15.5h4" />
    </>
  ),
  home: (
    <>
      <path d="m3.5 11 8.5-7 8.5 7" />
      <path d="M6 10v10h12V10M10 20v-5h4v5" />
    </>
  ),
  table: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 10h17M9 10v9M15 10v9" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="9" r="3" />
      <circle cx="16.5" cy="10" r="2.5" />
      <path d="M3.8 19c.5-3.4 2.3-5.2 5.2-5.2s4.7 1.8 5.2 5.2M14 14.5c3.2-.5 5.2 1 5.8 4.5" />
    </>
  ),
  verify: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.2 12.2 2.4 2.4 5.2-5.2" />
    </>
  ),
};

export function StudioNavIcon({
  className,
  name,
}: Readonly<{
  className?: string | undefined;
  name: StudioNavIconName;
}>) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}
