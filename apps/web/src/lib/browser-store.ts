"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

/*
 * 读浏览器存储，且首帧与服务端产物一致。
 *
 * localStorage 只有客户端有，所以站内多处都是这么写的：先用一个默认值渲染，
 * 挂载后在 effect 里读一次再 setState。那样有三个代价——
 *
 *   1. 先渲染一帧默认值、提交、再重画一次，界面看得见闪一下；
 *   2. 多一轮渲染，而这一轮完全是为了追上一个本来就已经知道的值；
 *   3. 一处写入，别处不知道。各组件只在挂载时读一次，屏蔽了某个作者之后，
 *      另一个已经挂载的列表还在按旧名单渲染。
 *
 * useSyncExternalStore 正是为这件事准备的：给它一份「服务端快照」，首帧用
 * 那一份，水合之后自动换成客户端的真实值，中间不经过多余的一帧；写入通过
 * 下面的 writeBrowserStore 广播，所有读同一个键的组件一起更新。
 */

const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of listeners) listener();
};

const subscribe = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  /*
   * 也听 storage 事件：那是别的标签页改了同一个键。不听的话，两个标签页
   * 里的同一个设置会长期各说各话。
   */
  globalThis.addEventListener?.("storage", onChange);
  return () => {
    listeners.delete(onChange);
    globalThis.removeEventListener?.("storage", onChange);
  };
};

/** 写入并广播。存储不可用时本次会话仍然生效，只是刷新后恢复。 */
export const writeBrowserStore = (key: string, value: string | null): void => {
  try {
    if (value === null) {
      globalThis.localStorage?.removeItem(key);
    } else {
      globalThis.localStorage?.setItem(key, value);
    }
  } catch {
    // 存储不可用（无痕模式、配额满）——不影响本次会话内的行为。
  }
  notify();
};

export const readBrowserStore = (key: string): string | null => {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

/**
 * 订阅某个键。
 *
 * `parse` 必须是稳定引用（模块级函数或 useCallback），否则每次渲染都会
 * 重新订阅。`serverValue` 是服务端与首帧用的那一份。
 */
export function useBrowserStore<T>(
  key: string,
  parse: (raw: string | null) => T,
  serverValue: T,
): T {
  /*
   * 缓存解析结果。
   *
   * getSnapshot 每次渲染都会被调用，React 用 Object.is 比对返回值——每次
   * 返回一个新数组或新对象会被判定为「变了」，于是无限重渲染。所以只在
   * 原始字符串真的变了的时候才重新解析。
   */
  const cache = useRef<{ raw: string | null; value: T } | null>(null);

  const getSnapshot = useCallback((): T => {
    const raw = readBrowserStore(key);
    if (cache.current === null || cache.current.raw !== raw) {
      cache.current = { raw, value: parse(raw) };
    }
    return cache.current.value;
  }, [key, parse]);

  return useSyncExternalStore(subscribe, getSnapshot, () => serverValue);
}
