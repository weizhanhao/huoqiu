import type { ReactNode } from "react";

import { DesktopShell } from "../../components/shell/desktop-shell";
import {
  SettingsHeading,
  SettingsNav,
} from "../../features/profile-settings/settings-nav";

/*
 * 设置页外壳。
 *
 * 八项各自独立成路由——可直达、可分享、可回退。此前所有设置堆在
 * /settings 一屏里，想让人「看隐私设置那一项」只能说「往下翻」。
 *
 * 导航拆成了客户端组件：它要标出当前在哪一项，而服务端组件拿不到 pathname。
 */
export default function SettingsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <DesktopShell activeUtility="settings">
      <div className="settings-layout">
        <SettingsNav />
        <div className="settings-content">
          {/*
            八个子页此前一个标题都没有：页面上第一个标题是右栏的「热股榜」。
            标题与选中的导航项取自同一份清单，不会对不上。
          */}
          <SettingsHeading />
          {children}
        </div>
      </div>
    </DesktopShell>
  );
}
