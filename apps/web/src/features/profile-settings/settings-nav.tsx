"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "../../app/settings/settings-shell.module.css";

/*
 * 设置页的八项导航。
 *
 * 单独拆成客户端组件，是因为要知道「现在在哪一项」——服务端组件拿不到
 * pathname。此前八项渲染得一模一样，在八个子页之间来回跳完全看不出
 * 自己在哪。
 */

const NAVIGATION = [
  {
    description: "编辑公开昵称、居住地与简介",
    group: "账号",
    href: "/settings",
    label: "个人资料",
  },
  {
    description: "验证当前密码后更换登录凭证",
    group: "账号",
    href: "/settings/password",
    label: "登录密码",
  },
  {
    description: "管理登录邮箱与其他绑定状态",
    group: "账号",
    href: "/settings/binding",
    label: "账号绑定",
  },
  {
    description: "选择进入消息中心的提醒类型",
    group: "互动",
    href: "/settings/notifications",
    label: "消息提醒",
  },
  {
    description: "限制谁可以评论你发布的讨论",
    group: "互动",
    href: "/settings/privacy",
    label: "隐私",
  },
  {
    description: "查看并管理你已屏蔽的账号",
    group: "互动",
    href: "/settings/blocked",
    label: "屏蔽管理",
  },
  {
    description: "选择行情中的涨跌配色习惯",
    group: "显示",
    href: "/settings/market",
    label: "行情配色",
  },
  {
    description: "调整主题、动效和内容显示方式",
    group: "显示",
    href: "/settings/preferences",
    label: "显示偏好",
  },
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
  return (
    <header className={styles.heading}>
      <h1>{current?.label ?? "设置"}</h1>
      <p>{current?.description ?? "管理账号与显示偏好"}</p>
    </header>
  );
}

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="设置导航" className={styles.navigation}>
      <Link className={styles.backLink} href="/">
        <span aria-hidden="true">←</span>
        返回首页
      </Link>
      <ul>
        {NAVIGATION.map((item, index) => (
          <li key={item.href}>
            {index === 0 || NAVIGATION[index - 1]?.group !== item.group ? (
              <p className={styles.groupLabel}>{item.group}</p>
            ) : null}
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
