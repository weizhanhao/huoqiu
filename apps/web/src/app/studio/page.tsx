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
      <section className={styles.card}>
        <h2 className={styles.heading}>开始写作</h2>
        <p className={styles.subheading}>
          短想法用发帖框随手发；成篇的观点写长文，可以先存草稿再发。
        </p>
        <p>
          <Link href="/studio/publish">写一篇长文 →</Link>
        </p>
      </section>

      <StudioMetrics scope="content" />
    </>
  );
}
