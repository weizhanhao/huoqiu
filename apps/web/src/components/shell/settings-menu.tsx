"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { useAccountSession } from "../../features/account/account-session";
import { ShellIcon } from "./shell-icons";

type SettingsMenuProperties = Readonly<{
  active: boolean;
}>;

/**
 * 顶栏的账号菜单。
 *
 * 设置图标是一个菜单开关，不是直接跳转的链接。菜单打开后才提供
 * 「个人设置」和「退出账号」，这样不会把退出这个账号操作藏到设置页深处。
 */
export function SettingsMenu({ active }: SettingsMenuProperties) {
  const { logout } = useAccountSession();
  const [open, setOpen] = useState(false);
  const rootReference = useRef<HTMLDivElement>(null);
  const triggerReference = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeWhenFocusLeaves = (event: FocusEvent): void => {
      if (
        event.target instanceof Node &&
        !rootReference.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const closeWhenPointerLeaves = (event: PointerEvent): void => {
      if (
        event.target instanceof Node &&
        !rootReference.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerReference.current?.focus();
    };

    document.addEventListener("focusin", closeWhenFocusLeaves);
    /*
     * 用捕获阶段监听：页面内某些交互会 stopPropagation，如果只在
     * 冒泡阶段收起，菜单就会偶发地「点到别处仍然不消失」。
     */
    document.addEventListener("pointerdown", closeWhenPointerLeaves, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("focusin", closeWhenFocusLeaves);
      document.removeEventListener("pointerdown", closeWhenPointerLeaves, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const handleLogout = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    setOpen(false);
    /*
     * 只调用会话 Provider 的真实登出：它会清除服务端签发的本地令牌并
     * 同步所有账号状态。用 replace 进入登录页，避免「后退」又回到旧的
     * 已登录页面。
     */
    logout();
    window.location.replace("/login");
  };

  return (
    <div
      className="top-settings-menu-wrap"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          setOpen(false);
        }
      }}
      ref={rootReference}
    >
      <button
        aria-controls="top-settings-menu"
        aria-current={active ? "page" : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="账号与设置"
        className="top-settings-trigger"
        onClick={() => setOpen((current) => !current)}
        ref={triggerReference}
        type="button"
      >
        <ShellIcon name="settings" />
        <span className="visually-hidden">设置</span>
      </button>
      <div
        aria-label="账号与设置"
        className="top-settings-menu"
        hidden={!open}
        id="top-settings-menu"
        role="menu"
      >
        <Link
          aria-current={active ? "page" : undefined}
          className="top-action-link"
          href="/settings"
          onClick={() => setOpen(false)}
          role="menuitem"
        >
          个人设置
        </Link>
        <button
          aria-label="退出账号"
          onClick={handleLogout}
          role="menuitem"
          type="button"
        >
          退出账号
        </button>
      </div>
    </div>
  );
}
