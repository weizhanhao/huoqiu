import { cssVariables } from "@huoqiu/web-ui";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AccountSessionProvider } from "../features/account/account-session";
import { NotificationSessionProvider } from "../features/notifications/notification-state";
import { ProfileSessionProvider } from "../features/profile-settings/profile-session";
import { SessionPostsProvider } from "../features/community/session-posts";
import { WatchlistGroupsProvider } from "../stores/watchlist-groups";
import { loadKlineSnapshot } from "../features/real-finance/kline.server";
import { D0WatchlistProvider } from "../stores/d0-watchlist";

import "./globals.css";

export const metadata: Metadata = {
  title: "火球",
  description: "公开市场信息的观察与整理",
};

type RootLayoutProperties = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProperties) {
  /*
   * 自选清单只认真实代码。
   *
   * 这份清单此前还收着 35 个虚构标的和夹具标的的 id，它们会随 RSC 载荷
   * 出现在每一页；而那些标的页现在一律 404——留着等于让自选认识一批
   * 点开就是 404 的东西。
   */
  const knownListingIds = [
    ...new Set((loadKlineSnapshot()?.series ?? []).map((series) => series.symbol)),
  ];

  return (
    <html lang="zh-CN">
      <head>
        <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
        {/*
          主题与涨跌配色预涂。
          必须是同步内联脚本，且排在样式之后、body 之前：只要晚一帧，
          选了深色的用户就会先看到一个白屏再被刷黑——那是最刺眼的一种抖动。

          涨跌配色同理，而且更要命：设成绿涨红跌的人如果先看到红色再翻绿，
          那一帧传达的是完全相反的信息。所以配色也走预涂，不等接口回来。
          脚本只读两个自有键、只写两个属性，任何异常都吞掉回落到默认。
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("huoqiu.theme");if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t}var m=localStorage.getItem("huoqiu.market-colors");if(m==="green-up"){document.documentElement.dataset.marketColors=m}}catch(e){}',
          }}
        />
      </head>
      <body>
        <AccountSessionProvider>
          <ProfileSessionProvider>
          <NotificationSessionProvider>
            <D0WatchlistProvider knownListingIds={knownListingIds}>
              <SessionPostsProvider>
                <WatchlistGroupsProvider>
                  {/*
                    只说自选。消息、资料和组合都已经跟着账号落盘了，
                    继续写「刷新后重置」等于告诉用户他刚改的东西保不住。
                  */}
                  {children}
                </WatchlistGroupsProvider>
              </SessionPostsProvider>
            </D0WatchlistProvider>
          </NotificationSessionProvider>
          </ProfileSessionProvider>
        </AccountSessionProvider>
      </body>
    </html>
  );
}
