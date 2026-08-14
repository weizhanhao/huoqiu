import type { Metadata } from "next";

import { PasswordPanel } from "../../../features/profile-settings/password-panel";

export const metadata: Metadata = {
  description: "验证当前密码后设置新的登录密码",
  title: "修改登录密码 · 火球",
};

export default function SettingsPasswordPage() {
  return <PasswordPanel />;
}
