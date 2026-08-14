"use client";

import { useState } from "react";

/*
 * 标的详情的「更多」。
 *
 * 原本是一个 UnavailableAction 占位——点开只会说「此功能暂未开放」。
 * 但复制链接这件事不需要任何后端能力，把它标成暂未开放属于该做没做。
 *
 * 只放确实能做到的：复制本页链接。
 *
 * 「去讨论」没有放进来——讨论区是客户端页签，一个锚点既跳不过去也切不了
 * 页签，那种链接比占位更糟：它看起来能用。价格提醒同理，需要推送通道，
 * 不做就不摆在这里。
 */
export function InstrumentActions() {
  const [status, setStatus] = useState("");

  const copyLink = async (): Promise<void> => {
    const url = globalThis.location?.href ?? "";
    try {
      await globalThis.navigator?.clipboard?.writeText(url);
      setStatus("链接已复制");
    } catch {
      // 剪贴板被拒绝（非 HTTPS、无权限）时如实告知，不假装成功。
      setStatus("浏览器拒绝了复制，请手动复制地址栏");
    }
  };

  return (
    <span className="instrument-actions">
      <button onClick={copyLink} type="button">
        复制链接
      </button>
      {/* 状态位常驻，出现提示时不会把同一行的元素推走。 */}
      <span aria-live="polite" className="instrument-actions-status">
        {status}
      </span>
    </span>
  );
}
