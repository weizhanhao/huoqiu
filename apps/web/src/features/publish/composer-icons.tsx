/*
 * 工具栏图标。
 *
 * 用内联 SVG，不用表情字符。字符方案在这里是行不通的：🖻（U+1F5BB）在
 * macOS 上根本没有字形，实测渲染成一个空豆腐块——一个看不出是什么的按钮，
 * 和一个坏掉的按钮在用户那里没有区别。而且 ☺ 与 @ # $ 分别来自不同字体，
 * 粗细和基线各走各的，六个摆在一起像是从四个地方抄来的。
 *
 * 统一 20×20、描边 1.5、fill 用 none：颜色交给 currentColor，悬停和聚焦
 * 时跟着文字色一起变，不必为每种状态各写一遍。
 */

export type ComposerIconName =
  "disclosure" | "emoji" | "image" | "longform" | "mention" | "stock" | "topic";

const PATHS: Readonly<Record<ComposerIconName, React.ReactNode>> = {
  disclosure: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.5v4.2" />
      <path d="M10 13.4v.2" />
    </>
  ),
  emoji: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M7.4 8.2v.2" />
      <path d="M12.6 8.2v.2" />
      <path d="M7.3 12a3.4 3.4 0 0 0 5.4 0" />
    </>
  ),
  image: (
    <>
      <rect height="12" rx="2.5" width="14" x="3" y="4" />
      <circle cx="7.6" cy="8.2" r="1.1" />
      <path d="M4 13.6 8 10l3 2.6 2.4-2 2.6 2.4" />
    </>
  ),
  longform: (
    <>
      <path d="M15.5 4.6 17 6.1l-6.6 6.6-2 .5.5-2z" />
      <path d="M15 12.4v3.1a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 15.5v-9A1.5 1.5 0 0 1 4.5 5h3.1" />
    </>
  ),
  mention: (
    <>
      <circle cx="10" cy="10" r="2.9" />
      <path d="M12.9 7.1v4a2.1 2.1 0 0 0 4.1-.7A7 7 0 1 0 13.4 16" />
    </>
  ),
  stock: (
    <>
      <path d="M10 3.4v13.2" />
      <path d="M13.2 6.4a3 3 0 0 0-3-1.6H9a2.4 2.4 0 0 0 0 4.8h2a2.4 2.4 0 0 1 0 4.8H9.6a3 3 0 0 1-3-1.6" />
    </>
  ),
  topic: (
    <>
      <path d="M7.4 3.8 6 16.2" />
      <path d="M13 3.8l-1.4 12.4" />
      <path d="M3.9 7.6h12.4" />
      <path d="M3.4 12.4h12.4" />
    </>
  ),
};

export function ComposerIcon({
  name,
}: Readonly<{ name: ComposerIconName }>): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 20 20"
      width="20"
    >
      {PATHS[name]}
    </svg>
  );
}
