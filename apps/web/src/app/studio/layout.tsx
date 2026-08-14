import type { ReactNode } from "react";

import styles from "./studio.module.css";
import { SiteTopbar } from "../../components/shell/site-topbar";
import { StudioNav } from "../../features/studio/studio-nav";

/*
 * 创作者中心的外壳。
 *
 * 和个股页同一套思路：外壳住在 layout 里，子路由切换时不重新挂载，
 * 左侧那列导航始终是同一批 DOM 节点，位置不可能跳。放在各 page 里的话，
 * 点一次导航就是一组新节点，容器宽度稍有出入就是一次硬跳。
 *
 * 也不套社区那套壳：创作者中心是一个工作台，首页/关注/热门那排页签、
 * 右栏热股榜在这里都是让人离开工作的入口。
 */
export default function StudioLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className={styles.shell}>
      {/*
        顶栏用全站共用的那一条。这里原先自己写了一条（logo + 分隔线 +
        「创作者中心」标题 + 搜索框），少了消息、发帖、设置和环境标识——
        从首页点进来，最上面整个跳一下，像换了个站。
        「创作者中心」这个标题移到左侧导航的顶部，那里本来就是讲这一节的。
      */}
      <SiteTopbar />

      <div className={styles.layout}>
        <aside aria-label="创作者中心导航" className={styles.nav}>
          <p className={styles.title}>创作者中心</p>
          <StudioNav />
        </aside>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
