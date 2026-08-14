import { SkeletonCard } from "../../../../components/instrument/skeleton";
import styles from "../../../../components/instrument/skeleton.module.css";

/*
 * 分区页的骨架。
 *
 * 各分区内容长短差得很远：融资融券是单行，十大股东是十行。骨架一律按
 * **最少**的来——两张小卡。骨架矮了，真实内容到达后容器往下长，下方是
 * 页面底部，没有元素被推动；骨架高了则内容到达时收缩，下方全部上跳，
 * 那才是实打实的位移。
 *
 * 放在这一层而不是 [listingId]：那一层的骨架会在进入行情主页时也出现，
 * 而两边的版式并不一样。各段各给各的。
 */
export default function SectionLoading() {
  return (
    <div className={styles.page}>
      <SkeletonCard lines={4} />
      <SkeletonCard lines={2} />
    </div>
  );
}
