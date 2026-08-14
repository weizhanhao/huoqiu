import type { Metadata } from "next";

import { SettingsPageExperience } from "../../../features/profile-settings/profile-settings-experience";

/*
 * 偏好设置。
 *
 * 承接原先堆在 /settings 一屏里的显示偏好——主题、减弱动效、社交数字显隐。
 * 这些是真做了的，只是位置不对；账号相关的四项已各自独立成路由。
 *
 * 截图里这一页还有「上传图片添加作者水印」，那一项尚未实现（见任务 #47），
 * 所以没有放一个点了不生效的开关上去。
 */
export const metadata: Metadata = {
  description: "主题、动效与显示偏好",
  title: "偏好设置 · 火球",
};

export default function SettingsPreferencesPage() {
  return <SettingsPageExperience />;
}
