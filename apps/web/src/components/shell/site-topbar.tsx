"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { activeNavHref } from "./active-nav";
import { GlobalSearchBox } from "./global-search-box";
import { NotificationNavigationLink } from "./notification-navigation-link";
import { PublishDialog } from "../../features/publish/publish-dialog";
import { DemoDataBadge } from "../system/demo-data-badge";

/*
 * 全站顶栏。
 *
 * 这一条在每一页都一样，所以只能有一份实现。此前社区壳和个股壳各写了一条：
 * 个股页那条只有 logo 和搜索框，没有消息、发帖、设置，也没有环境标识，
 * 搜索框的宽度和位置还不一样——从首页点进一只股票，最上面整个跳一下，
 * 像换了个站。
 *
 * 现在两个壳渲染的是同一个组件。要改顶栏只有这一处可改，也就不会再出现
 * 「一边改了、另一边忘了」。
 *
 * 选中态自己按地址算，不由调用方传：传参这件事页面很容易忘或传错，
 * 而错了只表现为「高亮在别处」，不报任何错。
 */
const TOPBAR_MATCHES = ["/notifications", "/settings"];

export function SiteTopbar() {
  /* 没有路由上下文时返回 null（静态渲染、测试里单独渲染都是）。 */
  const active = activeNavHref(usePathname() ?? "", TOPBAR_MATCHES);
  const notificationsActive = active === "/notifications";
  const settingsActive = active === "/settings";

  return (
    <header className="d0-topbar">
      <Link className="d0-brand" href="/" aria-label="火球首页">
        <span className="brand-mark" aria-hidden="true">
          火
        </span>
        {/*
          站名不是页面标题。这里原本是 <h1>，于是全站每一页的唯一 h1 都是
          「火球」——靠标题导航的人在二十多条路由之间跳，听到的永远是同一个
          词，完全不知道自己在哪一页。页面标题由各页自己给。
        */}
        <span className="brand-word">火球</span>
      </Link>
      <GlobalSearchBox />
      <nav className="top-actions" aria-label="顶部功能">
        <NotificationNavigationLink
          active={notificationsActive}
          variant="top"
        />
        {/*
          发帖走弹框，不再整页跳转。写一句话跳走一整页、发完再跳回来，
          中间那一页的上下文就丢了——雪球在这里也是弹框。
          长文仍然是独立一页，弹框里点「长文」过去。
        */}
        <PublishDialog className="top-action-link">
          <span className="unavailable-icon" aria-hidden="true">
            ＋
          </span>
          <span>发帖</span>
        </PublishDialog>
        <Link
          aria-current={settingsActive ? "page" : undefined}
          className="top-action-link"
          href="/settings"
        >
          <span className="unavailable-icon" aria-hidden="true">
            ⚙
          </span>
          <span>设置</span>
        </Link>
      </nav>
      <DemoDataBadge variant="environment" />
    </header>
  );
}
