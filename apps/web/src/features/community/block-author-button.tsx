"use client";

import { useBlockedAuthors } from "./blocked-authors";
import styles from "./community-experience.module.css";

/*
 * 卡片上的屏蔽入口。
 *
 * 屏蔽后这张卡会立刻从信息流里消失——所以按钮上写的是「屏蔽」，而不是
 * 含糊的「不感兴趣」：用户按下之前应该知道会发生什么。
 *
 * 已屏蔽作者的卡片正常情况下不会被渲染（信息流已过滤掉），但用户主页等
 * 地方仍可能出现，那里显示「取消屏蔽」，保证这个动作可逆。
 */
export function BlockAuthorButton({
  authorId,
  authorName,
}: Readonly<{ authorId: string; authorName: string }>) {
  const { blocked, ready, toggle } = useBlockedAuthors();
  const isBlocked = blocked.includes(authorId);

  return (
    <button
      aria-label={
        isBlocked ? `取消屏蔽 ${authorName}` : `屏蔽 ${authorName} 的内容`
      }
      aria-pressed={isBlocked}
      className={styles.blockButton}
      // 读完存储前不接受点击：否则可能基于空列表写回，抹掉已有的屏蔽。
      disabled={!ready}
      onClick={() => toggle(authorId)}
      type="button"
    >
      {isBlocked ? "取消屏蔽" : "屏蔽"}
    </button>
  );
}
