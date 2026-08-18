import type { Metadata } from "next";
import Link from "next/link";

import { StudioDashboardHeader } from "../../features/studio/studio-dashboard-header";
import styles from "../../features/studio/studio-page.module.css";
import { StudioMetrics } from "../../features/studio/studio-metrics";

export const metadata: Metadata = {
  description: "写作、草稿与自己的内容数据",
  title: "创作者中心 · 火球",
};

export default function StudioHomePage() {
  return (
    <>
      <StudioDashboardHeader />

      <div className={styles.dashboardGrid}>
        <StudioMetrics scope="content" />
        <section
          className={styles.quickPanel}
          aria-labelledby="studio-quick-title"
        >
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>QUICK ACCESS</p>
              <h2 className={styles.heading} id="studio-quick-title">
                继续你的创作
              </h2>
              <p className={styles.subheading}>从上次停下的地方继续</p>
            </div>
          </header>
          <nav aria-label="创作者常用入口" className={styles.quickLinks}>
            <Link href="/studio/publish">
              <strong aria-hidden="true">写</strong>
              <span>
                发布长文
                <small>开始一篇新内容</small>
              </span>
              <b aria-hidden="true">↗</b>
            </Link>
            <Link href="/studio/content">
              <strong aria-hidden="true">作</strong>
              <span>
                我的作品
                <small>查看已发布内容</small>
              </span>
              <b aria-hidden="true">↗</b>
            </Link>
            <Link href="/studio/drafts/article">
              <strong aria-hidden="true">稿</strong>
              <span>
                长文草稿
                <small>继续未完成的文章</small>
              </span>
              <b aria-hidden="true">↗</b>
            </Link>
          </nav>
        </section>
      </div>
    </>
  );
}
