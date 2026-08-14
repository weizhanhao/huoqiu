import Link from "next/link";

import styles from "./post-body.module.css";
import { parsePostBody, type MentionAccount } from "../publish/composer-tokens";

/*
 * 帖子正文。
 *
 * 发帖框工具栏往正文里插的是文本记号，这里把它们还原成链接和图片。
 * 少了这一层，用户选完一只股票发出去，读者看到的是一串
 * 「$贵州茅台(SH600519)$」的字面量——按钮就成了装样子的。
 *
 * 认不出来的记号一律按原文显示。猜着渲染的话，一条错的链接和一条对的
 * 链接在页面上完全一样，点下去才知道。
 */
export function PostBody({
  accounts,
  paragraphs,
  topics,
}: Readonly<{
  accounts: readonly MentionAccount[];
  paragraphs: readonly string[];
  topics: readonly string[];
}>) {
  return (
    <>
      {paragraphs.map((paragraph, paragraphIndex) => {
        const segments = parsePostBody(paragraph, { accounts, topics });
        return (
          <p
            className={styles.paragraph}
            key={`${String(paragraphIndex)}-${paragraph.slice(0, 12)}`}
          >
            {segments.map((segment, index) => {
              const key = `${String(paragraphIndex)}-${String(index)}`;
              if (segment.kind === "text") {
                return <span key={key}>{segment.text}</span>;
              }
              if (segment.kind === "image") {
                /*
                 * 尺寸由 CSS 限住，不写死 width/height：上传的图什么比例都有，
                 * 写死会把它们全部拉变形。
                 *
                 * 用原生 img 而不是 next/image：后者要在渲染前就知道尺寸，
                 * 而这是用户刚传上来的图，尺寸只有文件本身知道。
                 */
                return (
                  <img
                    alt="帖子配图"
                    className={styles.image}
                    key={key}
                    loading="lazy"
                    src={segment.src}
                  />
                );
              }
              return (
                <Link
                  className={
                    segment.kind === "cashtag" ? styles.cashtag : styles.mention
                  }
                  href={segment.href}
                  key={key}
                >
                  {segment.text}
                </Link>
              );
            })}
          </p>
        );
      })}
    </>
  );
}
