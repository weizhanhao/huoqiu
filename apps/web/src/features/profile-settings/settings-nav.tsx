"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/*
 * 设置页的八项导航。
 *
 * 单独拆成客户端组件，是因为要知道「现在在哪一项」——服务端组件拿不到
 * pathname。此前八项渲染得一模一样，在八个子页之间来回跳完全看不出
 * 自己在哪。
 */

const NAVIGATION = [
  { href: "/settings", label: "个人资料" },
  { href: "/settings/password", label: "修改登录密码" },
  { href: "/settings/notifications", label: "消息提醒设置" },
  { href: "/settings/privacy", label: "隐私设置" },
  { href: "/settings/blocked", label: "已屏蔽用户" },
  { href: "/settings/market", label: "股票设置" },
  { href: "/settings/binding", label: "账号绑定" },
  { href: "/settings/preferences", label: "偏好设置" },
] as const;

/**
 * 当前这一页的标题。
 *
 * 八个设置子页此前一个标题都没有——页面上第一个标题是右栏的「热股榜」。
 * 靠标题导航的人打开「修改登录密码」，听到的第一句是「热股榜」。
 *
 * 标题从同一份 NAVIGATION 里取，不另写一份：两份清单迟早会对不上，
 * 而对不上的表现是标题写着一页、选中的却是另一页。
 */
export function SettingsHeading() {
  const pathname = usePathname();
  const current = NAVIGATION.find((item) => item.href === pathname);
  return <h1>{current?.label ?? "设置"}</h1>;
}

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="设置导航" className="settings-nav">
      <ul>
        {NAVIGATION.map((item) => (
          <li key={item.href}>
            <Link
              /*
               * 根路径要精确匹配。
               * /settings 是其余七项的前缀，用 startsWith 会让八项同时高亮。
               */
              aria-current={pathname === item.href ? "page" : undefined}
              href={item.href}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
