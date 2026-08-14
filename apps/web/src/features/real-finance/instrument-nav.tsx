"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./instrument-nav.module.css";
import {
  bareCode,
  instrumentSectionGroups,
  type InstrumentSection,
} from "./instrument-sections";

/*
 * 标的详情左栏导航。
 *
 * 三种状态在导航上就分开，不等用户点进去才知道：
 *   ready    普通站内链接
 *   planned  不可点的文字 +「未实现」。做成能点的链接等于骗一次点击
 *   external 外链 +「站外」，用户点之前就知道会离开本站
 */

type NavItemProperties = Readonly<{
  currentSlug: string | null;
  section: InstrumentSection;
  symbol: string;
}>;

function NavItem({ currentSlug, section, symbol }: NavItemProperties) {
  if (section.status === "external" && section.externalHref !== undefined) {
    return (
      <a
        className={styles.link}
        href={section.externalHref.replace("{code}", bareCode(symbol))}
        rel="noreferrer"
        target="_blank"
      >
        <span>{section.label}</span>
        <span className={styles.tag}>站外</span>
      </a>
    );
  }

  /*
   * 站内独立页面。
   *
   * 选股器是跨标的的，不属于这一只股票——所以它是普通站内链接，
   * 既不该带「站外」标记，也不该指向 /instruments/<code>/screener。
   */
  if (section.status === "site" && section.siteHref !== undefined) {
    return (
      <Link className={styles.link} href={section.siteHref}>
        <span>{section.label}</span>
      </Link>
    );
  }

  if (section.status === "planned") {
    return (
      <span className={`${styles.item} ${styles.planned}`}>
        <span>{section.label}</span>
        <span className={styles.tag}>未实现</span>
      </span>
    );
  }

  const isCurrent = section.slug === currentSlug;
  return (
    <Link
      aria-current={isCurrent ? "page" : undefined}
      className={`${styles.link}${isCurrent ? ` ${styles.current}` : ""}`}
      href={`/instruments/${symbol}/${section.slug}`}
    >
      <span>{section.label}</span>
    </Link>
  );
}

export function InstrumentNav({
  currentSlug: explicitSlug = null,
  symbol,
}: Readonly<{ currentSlug?: string | null; symbol: string }>) {
  /*
   * 当前分区由地址栏决定，不靠上层传。
   *
   * 这一列导航住在 layout 里，而 layout 在子路由之间切换时不会重新渲染
   * ——这正是它的价值：导航始终是同一个 DOM 节点，位置不可能跳。
   * 代价是它拿不到子路由的参数，所以自己读 pathname。
   *
   * explicitSlug 留给不在这条路由下的调用方（以及测试）。
   */
  /*
   * 没有路由上下文时 usePathname 返回 null（静态渲染、测试里单独渲染
   * 都是这种情况）。不兜住的话整列导航直接抛异常——一个只为高亮当前项
   * 的读取，不该有能力让导航渲染不出来。
   */
  const pathname = usePathname() ?? "";
  const fromPath = pathname.startsWith(`/instruments/${symbol}/`)
    ? (pathname.split("/")[3] ?? null)
    : null;
  const currentSlug = explicitSlug ?? fromPath;

  return (
    <nav aria-label="标的详情分区" className={styles.nav}>
      <ul className={styles.list}>
        <li>
          <Link
            aria-current={currentSlug === null ? "page" : undefined}
            className={`${styles.link}${currentSlug === null ? ` ${styles.current}` : ""}`}
            href={`/instruments/${symbol}`}
          >
            <span>行情</span>
          </Link>
        </li>
      </ul>
      {instrumentSectionGroups.map((group) => (
        <div className={styles.group} key={group.title}>
          <p className={styles.groupTitle}>{group.title}</p>
          <ul className={styles.list}>
            {group.items.map((section) => (
              <li key={section.slug}>
                <NavItem
                  currentSlug={currentSlug}
                  section={section}
                  symbol={symbol}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
