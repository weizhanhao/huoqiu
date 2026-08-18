import type { Metadata } from "next";
import Link from "next/link";

import styles from "../../features/studio/studio-page.module.css";
import { StudioMetrics } from "../../features/studio/studio-metrics";

export const metadata: Metadata = {
  description: "写作、草稿与自己的内容数据",
  title: "创作者中心 · 火球",
};

export default function StudioHomePage() {
  return (
    <>
      <section className={styles.workspaceHeader}>
        <div className={styles.workspaceCopy}>
          <p className={styles.eyebrow}>创作工作台</p>
          <h1>写作与数据</h1>
          <p>
            在一处管理长文、草稿和真实互动数据。短想法继续从首页发帖框发布。
          </p>
        </div>
        <Link className={styles.workspaceAction} href="/studio/publish">
          写一篇长文
          <span aria-hidden="true">→</span>
        </Link>
      </section>

      <StudioMetrics scope="content" />

      <section
        className={styles.quickPanel}
        aria-labelledby="studio-quick-title"
      >
        <header className={styles.sectionHeader}>
          <div>
            <h2 className={styles.heading} id="studio-quick-title">
              常用入口
            </h2>
            <p className={styles.subheading}>
              继续写作或查看已经产生的真实记录
            </p>
          </div>
        </header>
        <nav aria-label="创作者常用入口" className={styles.quickLinks}>
          <Link href="/studio/publish">
            <span>发布长文</span>
            <small>开始一篇新内容</small>
          </Link>
          <Link href="/studio/content">
            <span>我的作品</span>
            <small>查看已发布内容</small>
          </Link>
          <Link href="/studio/drafts/article">
            <span>长文草稿</span>
            <small>继续未完成的文章</small>
          </Link>
        </nav>
      </section>
    </>
  );
}
