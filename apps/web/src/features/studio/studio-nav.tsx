"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./studio-nav.module.css";
import { studioGroups } from "./studio-sections";

/*
 * 创作者中心左侧导航。
 *
 * 当前项由地址栏决定，不靠上层传。这一列住在 layout 里，而 layout 在子路由
 * 之间切换时不会重新渲染——始终是同一批 DOM 节点，位置不可能跳。代价是
 * 它拿不到子路由参数，所以自己读 pathname。个股页那条导航是同一套做法。
 */
export function StudioNav() {
  /*
   * 没有路由上下文时 usePathname 返回 null（静态渲染、测试里单独渲染都是）。
   * 不兜住的话整列导航直接抛异常——一个只为高亮的读取，不该有能力让导航
   * 渲染不出来。
   */
  const pathname = usePathname() ?? "";
  const current = pathname.replace(/^\/studio\/?/u, "");

  return (
    <nav aria-label="创作者中心分区" className={styles.nav}>
      <Link
        aria-current={current === "" ? "page" : undefined}
        className={`${styles.link}${current === "" ? ` ${styles.current}` : ""}`}
        href="/studio"
      >
        首页
      </Link>

      {studioGroups.map((group) => (
        <div className={styles.group} key={group.label}>
          <p className={styles.groupLabel}>{group.label}</p>
          <ul className={styles.list}>
            {group.sections.map((section) => (
              <li key={section.slug}>
                <Link
                  aria-current={current === section.slug ? "page" : undefined}
                  className={`${styles.link}${
                    current === section.slug ? ` ${styles.current}` : ""
                  }`}
                  href={`/studio/${section.slug}`}
                >
                  <span>{section.label}</span>
                  {/*
                    背后没有真能力的那几块，在导航上就标出来。
                    点进去才发现是空的，比一开始就说清楚糟得多。
                  */}
                  {section.status === "preview" ? (
                    <small className={styles.badge}>未接入</small>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
