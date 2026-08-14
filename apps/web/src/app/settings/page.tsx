import type { Metadata } from "next";

import { ProfileEditorPanel } from "../../features/profile-settings/profile-editor-panel";

/*
 * 设置的首屏是「个人资料」，与截图侧栏第一项一致。
 * 外壳与八项导航在 layout.tsx，这里只负责这一项的内容。
 */
export const metadata: Metadata = {
  description: "编辑昵称、居住地、性别与个人简介",
  title: "个人资料 · 火球",
};

export default function SettingsPage() {
  return <ProfileEditorPanel />;
}
