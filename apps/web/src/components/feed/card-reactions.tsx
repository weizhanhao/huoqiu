"use client";

import { useCallback } from "react";

import {
  readBrowserStore,
  useBrowserStore,
  writeBrowserStore,
} from "../../lib/browser-store";

/*
 * 信息流卡片的互动。
 *
 * 这里原本是两个写死的 span：「演示内容」「只读演示」——看得见、点不动，
 * 整个首页因此像一堵墙。现在点赞和收藏都是真的：状态写进 localStorage，
 * 刷新、换页、重开浏览器都还在。
 *
 * 计数从卡片自带的基数起算，点赞后 +1。基数是这条内容已有的读者行为，
 * 自己那一票加在上面——这比「点了数字不动」诚实，也比凭空造一个漂亮
 * 数字诚实。
 *
 * 防抖动：两个按钮都有固定最小宽度，「点赞 / 已赞」文案长度不同也不会把
 * 同一行右侧的元素推走；服务端渲染的首帧一律是未选中态，挂载后才读
 * localStorage，而两种状态的盒模型完全一致，所以不产生位移。
 */

const STORAGE_KEY = "huoqiu.feed-reactions.v1";

type Reaction = Readonly<{ bookmarked: boolean; liked: boolean }>;

const EMPTY: Reaction = { bookmarked: false, liked: false };

const parseAll = (raw: string | null): Record<string, Reaction> => {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, Reaction>)
      : {};
  } catch {
    // 存储被禁用或内容损坏时按「没有互动过」处理，不影响页面可用。
    return {};
  }
};

export function CardReactions({
  bookmarkBaseline = 0,
  cardId,
  likeBaseline = 0,
}: Readonly<{
  bookmarkBaseline?: number;
  cardId: string;
  likeBaseline?: number;
}>) {
  /*
   * 直接订阅存储，不再「先渲染成没互动过、挂载后读一次再 setState」——
   * 那样点过赞的卡片在水合后会闪一下从「点赞」跳成「已赞」。
   *
   * parse 用 useCallback 固定：它依赖 cardId，每次渲染新建一个会让订阅
   * 每帧重建。
   */
  const parseOne = useCallback(
    (raw: string | null): Reaction => parseAll(raw)[cardId] ?? EMPTY,
    [cardId],
  );
  const reaction = useBrowserStore(STORAGE_KEY, parseOne, EMPTY);

  const toggle = (key: keyof Reaction): void => {
    const all = parseAll(readBrowserStore(STORAGE_KEY));
    const current = all[cardId] ?? EMPTY;
    const next = { ...current, [key]: !current[key] };
    writeBrowserStore(STORAGE_KEY, JSON.stringify({ ...all, [cardId]: next }));
  };

  return (
    <div className="feed-card-actions" aria-label="内容互动">
      <button
        aria-pressed={reaction.liked}
        className="feed-card-action"
        onClick={() => toggle("liked")}
        type="button"
      >
        {reaction.liked ? "已赞" : "点赞"}{" "}
        <span>{likeBaseline + (reaction.liked ? 1 : 0)}</span>
      </button>
      <button
        aria-pressed={reaction.bookmarked}
        className="feed-card-action"
        onClick={() => toggle("bookmarked")}
        type="button"
      >
        {reaction.bookmarked ? "已收藏" : "收藏"}{" "}
        <span>{bookmarkBaseline + (reaction.bookmarked ? 1 : 0)}</span>
      </button>
    </div>
  );
}
