"use client";

import Link from "next/link";

import { useAccountSession } from "./account-session";

/*
 * 侧栏身份区。
 *
 * 这里原本写死「关注 18 / 粉丝 186 / 帖子 42」——用户一眼就看出是假的，
 * 因为无论注册多少账号、发多少帖，数字纹丝不动。现在三个数字全部来自
 * /api/social/me 的真实计数。
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

      <p className="sidebar-stats">
        <span>
          关注 <strong>{stat(account?.followingCount ?? 0)}</strong>
        </span>
        <span>
          粉丝 <strong>{stat(account?.followerCount ?? 0)}</strong>
        </span>
        <span>
          帖子 <strong>{stat(account?.postCount ?? 0)}</strong>
        </span>
      </p>
    </>
  );
}
