import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./studio.module.css";
import { GlobalSearchBox } from "../../components/shell/global-search-box";
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
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/" aria-label="火球首页">
          <span aria-hidden="true" className={styles.brandMark}>
            火
          </span>
          <span className={styles.brandWord}>火球</span>
        </Link>
        <span className={styles.divider} aria-hidden="true" />
        <p className={styles.title}>创作者中心</p>
        <GlobalSearchBox />
      </header>

      <div className={styles.layout}>
        <aside aria-label="创作者中心导航" className={styles.nav}>
          <StudioNav />
        </aside>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
