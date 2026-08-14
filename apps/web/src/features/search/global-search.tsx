import Link from "next/link";

import { communityAuthors } from "../community/community-author-fixtures";
import { communityFeedCards } from "../community/community-fixtures";
import styles from "./global-search.module.css";

/*
 * 全局搜索的非标的部分。
 *
 * 标的搜索由 InstrumentHits 负责（走公开证券代码表，不再是 D0 夹具）。
 * 这里补的是帖子与作者两类。基金、ETF 的搜索走顶栏搜索框，
 * 那里打的是公开证券代码表。
 *
 * 全部在编译期常量上做匹配，不发起任何请求。
 */

const normalize = (value: string): string =>
  value.trim().toLocaleLowerCase("zh-CN");

type SearchGroup = Readonly<{
  emptyHint: string;
  id: string;
  items: readonly Readonly<{
    href: string;
    key: string;
    meta: string;
    title: string;
  }>[];
  label: string;
  moreHref: string;
}>;

const buildGroups = (query: string): readonly SearchGroup[] => {
  const needle = normalize(query);
  const matches = (...fields: readonly string[]): boolean =>
    needle.length > 0 &&
    fields.some((field) => normalize(field).includes(needle));

  return [
    /*
     * 基金与 ETF 两组删掉了。
     *
     * 它们列的是 fund_syn_000x / etf_syn_000x——链向 /funds/fund_syn_0001
     * 与 /etfs/etf_syn_0001，而这两条路由现在都是 404。真实基金与 ETF 的
     * 搜索在顶栏，走的是公开证券代码表。
     */
    {
      emptyHint: "没有匹配的帖子",
      id: "posts",
      items: communityFeedCards
        .filter((card) => matches(card.title, card.body, card.author))
        .slice(0, 6)
        .map((card) => ({
          href: card.detailHref ?? "/community",
          key: card.id,
          meta: `${card.author} · ${card.kind} · ${card.publishedLabel}`,
          title: card.title,
        })),
      label: "帖子",
      moreHref: "/community",
    },
    {
      emptyHint: "没有匹配的作者",
      id: "authors",
      items: communityAuthors
        .filter((author) =>
          matches(author.displayName, author.role, author.bio),
        )
        .map((author) => ({
          href: "/creators",
          key: author.id,
          meta: `${author.role} · ${author.notes} 篇固定笔记`,
          title: author.displayName,
        })),
      label: "达人",
      moreHref: "/creators",
    },
  ];
};

export function GlobalSearchResults({ query }: Readonly<{ query: string }>) {
  if (query.trim().length === 0) {
    return null;
  }

  const groups = buildGroups(query);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <section
      aria-labelledby="global-search-heading"
      className={styles.results}
      data-testid="global-search"
    >
      <div className={styles.heading}>
        <h2 id="global-search-heading">其他结果</h2>
        <span>基金 / ETF / 帖子 / 达人 共 {total} 条</span>
      </div>

      {groups.map((group) => (
        <section
          aria-labelledby={`search-group-${group.id}`}
          className={styles.group}
          key={group.id}
        >
          <div className={styles.groupHeading}>
            <h3 id={`search-group-${group.id}`}>{group.label}</h3>
            <Link href={group.moreHref}>浏览全部</Link>
          </div>
          {group.items.length === 0 ? (
            <p className={styles.empty}>{group.emptyHint}</p>
          ) : (
            <ul className={styles.list}>
              {group.items.map((item) => (
                <li key={item.key}>
                  <Link className={styles.row} href={item.href}>
                    <strong>{item.title}</strong>
                    <span>{item.meta}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </section>
  );
}
