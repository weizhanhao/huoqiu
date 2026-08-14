import type { Metadata } from "next";

import { AuthExperience } from "../../../features/account/auth-experience";

/*
 * 注册。
 *
 * 与登录同走 (auth) 的独立外壳：这一屏只做一件事。
 */
export const metadata: Metadata = {
  description: "注册火球账号，帖子与关注关系写入本机服务端并持久保存",
  title: "注册 · 火球",
};

export default async function RegisterPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Readonly<{ next?: string | readonly string[] }>>;
}>) {
  const { next } = await searchParams;
  return (
    <AuthExperience
      mode="register"
      nextPath={typeof next === "string" ? next : null}
    />
  );
}
