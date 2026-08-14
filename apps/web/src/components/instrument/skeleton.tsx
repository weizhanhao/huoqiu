import styles from "./skeleton.module.css";

/*
 * 骨架。
 *
 * 两条纪律，都是反直觉的：
 *
 * 一、宁可矮，不可高。CLS 只计算**已渲染元素的位移**：骨架偏矮，真实内容
 *     到达后容器向下生长，下方是页面底部，没有元素被推动，计分接近零；
 *     骨架偏高则内容到达后容器收缩，下方所有东西上跳，实打实计分。
 *     所以行数取「最少可能」，不取平均值。
 *
 * 二、动画只能动 background-position / opacity / transform。
 *     动 width 会让骨架自己制造抖动——本来是来消除抖动的。
 */

export function SkeletonLine({ width = "100%" }: Readonly<{ width?: string }>) {
  return <span className={styles.line} style={{ width }} />;
}

export function SkeletonCard({ lines = 3 }: Readonly<{ lines?: number }>) {
  return (
    <div className={styles.card}>
      <SkeletonLine width="4em" />
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonLine
          key={index}
          /* 末行短一点，读起来才像一段文字而不是一堆条。 */
          width={index === lines - 1 ? "62%" : "100%"}
        />
      ))}
    </div>
  );
}

/*
 * 右栏骨架。
 *
 * 只摆两张卡、每张三行——真实右栏是简介（八行）＋相关股票（六行）＋
 * 相关基金（六行）。故意矮一截：宽度由列定义钉死（280px），横向不会动；
 * 纵向宁可让它长出来，也不要让它塌回去。
 */
export function StockRailSkeleton() {
  return (
    <aside aria-hidden="true" className={styles.rail}>
      <SkeletonCard lines={3} />
      <SkeletonCard lines={3} />
    </aside>
  );
}
