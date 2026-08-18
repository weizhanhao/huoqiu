"use client";

import Link from "next/link";

import { useAccountSession } from "./account-session";

/*
 * 侧栏身份区。
 *
 * 这里原本写死「关注 18 / 粉丝 186 / 帖子 42」——用户一眼就看出是假的，
 * 因为无论注册多少账号、发多少帖，数字纹丝不动。现在三个数字全部来自
 * /api/social/me 的真实计数。侧栏只展示雪球同层级的关注与粉丝；帖子数留在
 * 个人主页，不在这里挤成第三项。
 *
 * 防抖动：账号数据是客户端拉的，首帧一定拿不到。所以
 *   1) 未登录/加载中都渲染同样结构、同样行数的内容，只是文字不同；
 *   2) 数字位用 tabular-nums（globals.css 已设），宽度变化不影响行高；
 *   3) 名称单行省略，长昵称不会折行撑高。
 * 这样从「加载中」切到「已登录」不产生任何几何变化。
 */

const DASH = "—";

export function SidebarAccount({
  fallbackName,
}: Readonly<{ fallbackName: string }>) {
  const { account, loading } = useAccountSession();

  const signedIn = account !== null;
  const href = signedIn ? `/users/${account.id}` : "/login";
  const name = signedIn ? account.displayName : fallbackName;
  const caption = signedIn
    ? account.email
    : loading
      ? "读取本地账号…"
      : "未登录 · 点此登录或注册";
  const avatar = [...name][0] ?? "火";

  const stat = (value: number): string => (signedIn ? String(value) : DASH);

  return (
    <>
      <Link className="seed-user" href={href}>
        <span className="seed-avatar" aria-hidden="true">
          {avatar}
        </span>
        <div className="sidebar-identity">
          <strong>{name}</strong>
          <small>{caption}</small>
        </div>
      </Link>

      {/*
        关注与粉丝要点得进去。
        这两个计数原先是纯文字——站内明明已经有 /users/<id>/following 与
        /followers 两页，用户点上去却毫无反应，只能以为是坏了。
        未登录时没有 id 可指，保持纯文字。
      */}
      <p className="sidebar-stats">
        {account === null ? (
          <span>
            关注<strong>{stat(0)}</strong>
          </span>
        ) : (
          <Link href={`/users/${account.id}/following`}>
            关注<strong>{stat(account.followingCount)}</strong>
          </Link>
        )}
        {account === null ? (
          <span>
            粉丝<strong>{stat(0)}</strong>
          </span>
        ) : (
          <Link href={`/users/${account.id}/followers`}>
            粉丝<strong>{stat(account.followerCount)}</strong>
          </Link>
        )}
      </p>
    </>
  );
}
