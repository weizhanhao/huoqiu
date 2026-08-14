"use client";

import Link from "next/link";

import { useAccountSession } from "../../features/account/account-session";
import { NotificationUnreadBadge } from "./notification-navigation-link";

/*
 * 「我的」入口的落点。
 *
 * 侧栏身份区早先已经改成跟随真实账号了，但这两个入口——桌面侧栏的
 * 「我的主页」和移动端底栏的「我的」——还写死指向内置样本用户。
 * 于是注册了真实账号的人点「我的主页」，落到的是别人的页面，
 * 地址栏上还明写着 demo。修一半反而更容易让人以为已经修好了。
 *
 * 已登录指向本人主页，未登录指向 /login：没有账号时本来就没有主页，
 * 与其给一个点了不知道去哪的链接，不如直说要先登录。
 */
/*
 * 落点规则单独抽成纯函数，好让它能被直接断言。
 *
 * 规则本身是这次出问题的地方，而它原先只藏在组件里；要验证「登录后指向
 * 本人主页」就得连 React context 一起搭起来，仓库里没有一个测试这么做过，
 * 于是登录态那一半始终没有测试看着。纯函数没有这个门槛。
 */
export function profileHref(
  account: Readonly<{ id: string }> | null,
): string {
  return account === null ? "/login" : `/users/${account.id}`;
}

function useProfileHref(): string {
  return profileHref(useAccountSession().account);
}

type ProfileNavigationLinkProperties = Readonly<{
  active?: boolean;
}>;

export function ProfileNavigationLink({
  active = false,
}: ProfileNavigationLinkProperties) {
  const href = useProfileHref();

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className="profile-navigation-link"
      href={href}
    >
      <span aria-hidden="true">◉</span>
      <span>我的</span>
      <NotificationUnreadBadge />
    </Link>
  );
}

/** 桌面侧栏「我的」分组下的主页入口，与移动端底栏共用同一套落点规则。 */
export function SidebarProfileLink({
  active = false,
}: ProfileNavigationLinkProperties) {
  const href = useProfileHref();

  return (
    <Link aria-current={active ? "page" : undefined} href={href}>
      <span aria-hidden="true" className="nav-icon">
        ◉
      </span>
      我的主页
    </Link>
  );
}
