"use client";

import { useCallback } from "react";

import {
  readBrowserStore,
  useBrowserStore,
  writeBrowserStore,
} from "../../lib/browser-store";

/*
 * 屏蔽作者。
 *
 * 金融社区没有任何内容治理入口是个真实缺口：看到荐股、广告，或者单纯不想
 * 再读某个人的内容时，用户无处可点。
 *
 * 这里只做能做成真的那一半——屏蔽。屏蔽后该作者的内容立刻从信息流里消失，
 * 选择写进 localStorage，刷新和重开浏览器都还在。
 *
 * 没有做「举报」：举报要有人工审核队列才有意义，本地预览没有那个东西。
 * 做一个点了只弹「已收到」、实际上永远没人看的按钮，比不做更糟。
 */

const STORAGE_KEY = "huoqiu.blocked-authors.v1";

const parseBlocked = (raw: string | null): readonly string[] => {
  if (raw === null) return NONE;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : NONE;
  } catch {
    return NONE;
  }
};

/* 模块级常量：每次返回一个新数组会让快照比对判定为「变了」。 */
const NONE: readonly string[] = [];

export function useBlockedAuthors() {
  /*
   * 直接订阅存储。
   *
   * 原先是「首帧按没有屏蔽任何人渲染，挂载后读一次再 setState」——服务端
   * 渲染拿不到浏览器存储，首帧就按屏蔽后的列表渲染会水合失配。
   * useSyncExternalStore 的服务端快照正是为这件事准备的：首帧用空名单，
   * 水合后直接换成真实名单，不经过多余的一帧。
   *
   * 顺带修好一件事：屏蔽一个作者后，页面上其他已挂载的列表原先不会知道，
   * 要刷新才跟上；现在写入会广播给所有订阅者。
   */
  const blocked = useBrowserStore(STORAGE_KEY, parseBlocked, NONE);

  const toggle = useCallback((authorId: string) => {
    const current = parseBlocked(readBrowserStore(STORAGE_KEY));
    const next = current.includes(authorId)
      ? current.filter((entry) => entry !== authorId)
      : [...current, authorId];
    writeBrowserStore(STORAGE_KEY, JSON.stringify(next));
  }, []);

  /*
   * ready 恒为 true：值在首帧就是确定的（服务端快照），不再有「还没读到」
   * 这个中间态。保留这个字段是因为调用方还在用它。
   */
  return { blocked, ready: true, toggle };
}
