import type { Metadata } from "next";

import { AuthExperience } from "../../../features/account/auth-experience";
import { LoginMethods } from "../../../features/account/login-methods";

/*
 * 登录。
 *
 * 这一页走 (auth) 路由组的独立外壳，不套整站导航——一边让人登录、一边在
 * 旁边摆一排需要登录才能用的入口，是自相矛盾的。
 */
export const metadata: Metadata = {
  description: "登录火球账号，发帖与关注均使用真实账号数据",
  title: "登录 · 火球",
};

/*
 * 「点了才发现要登录」会带上 ?next=；由这一侧读，客户端组件就不必碰
 * location，也不必为 useSearchParams 再包一层 Suspense。
 */
export default async function LoginPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Readonly<{ next?: string | readonly string[] }>>;
}>) {
  const { next } = await searchParams;
  return (
    <>
      <AuthExperience
        mode="login"
        nextPath={typeof next === "string" ? next : null}
      />
      {/*
        登录方式一览。验证码、扫码、微信这三种本机都接不了，
        所以如实列出并写明原因，而不是摆三个点了没反应的按钮。
      */}
      <LoginMethods />
    </>
  );
}
