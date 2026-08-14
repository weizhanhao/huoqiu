"use client";

import { useBrowserStore, writeBrowserStore } from "../../lib/browser-store";

/*
 * 主题切换。
 *
 * 设计令牌早就产出了三态选择器（:root / prefers-color-scheme / [data-theme]），
 * 但全站没有任何代码去写 data-theme——结果是暗色其实做好了，用户却只能
 * 被动跟随系统，设置页里连开关都没有。
 *
 * 三个档位是有意的：跟随系统 / 浅色 / 深色。只给一个二元开关会丢掉
 * 「跟随系统」这个多数人的默认期望，白天黑夜自动切换的能力不该被抹掉。
 *
 * 首帧闪烁由 layout 里的预涂脚本负责（在样式生效前就把属性写上），
 * 这个组件只负责后续切换与持久化。
 */

export const THEME_STORAGE_KEY = "huoqiu.theme";

type ThemeChoice = "dark" | "light" | "system";

const OPTIONS: readonly Readonly<{ label: string; value: ThemeChoice }>[] = [
  { label: "跟随系统", value: "system" },
  { label: "浅色", value: "light" },
  { label: "深色", value: "dark" },
];

const isThemeChoice = (value: unknown): value is ThemeChoice =>
  value === "dark" || value === "light" || value === "system";

const applyTheme = (choice: ThemeChoice): void => {
  const root = globalThis.document?.documentElement;
  if (root === undefined) return;
  if (choice === "system") {
    root.removeAttribute("data-theme");
    return;
  }
  root.dataset.theme = choice;
};

const parseChoice = (raw: string | null): ThemeChoice =>
  isThemeChoice(raw) ? raw : "system";

export function ThemeToggle() {
  /*
   * 直接订阅存储，不再「先渲染默认值、挂载后读一次再 setChoice」——
   * 那样按钮的选中态会在水合后闪一下从「跟随系统」跳到用户实际选的那档。
   */
  const choice = useBrowserStore(THEME_STORAGE_KEY, parseChoice, "system");

  const select = (next: ThemeChoice): void => {
    applyTheme(next);
    writeBrowserStore(THEME_STORAGE_KEY, next);
  };

  return (
    <div className="theme-toggle" role="group" aria-label="配色主题">
      {OPTIONS.map((option) => (
        <button
          aria-pressed={choice === option.value}
          key={option.value}
          onClick={() => select(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
