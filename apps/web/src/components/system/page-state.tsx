"use client";

import type { ReactNode } from "react";

type PageStateProperties = Readonly<{
  state: "normal" | "loading" | "empty" | "error";
  children?: ReactNode;
  emptyMessage?: string;
  errorMessage?: string;
  onRetry?: () => void;
}>;

export function PageState({
  state,
  children,
  emptyMessage = "暂无演示内容",
  errorMessage = "暂时无法加载演示数据",
  onRetry,
}: PageStateProperties) {
  if (state === "normal") {
    return children;
  }

  if (state === "loading") {
    return (
      <section
        className="page-state page-state-loading"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="visually-hidden">正在加载演示数据</span>
        <div className="state-skeleton" aria-hidden="true" />
        <div
          className="state-skeleton state-skeleton-short"
          aria-hidden="true"
        />
        <div className="state-skeleton" aria-hidden="true" />
      </section>
    );
  }

  if (state === "empty") {
    return (
      <section className="page-state" role="status">
        <span className="page-state-mark" aria-hidden="true">
          ○
        </span>
        <h2>{emptyMessage}</h2>
        <p>这里会展示固定 Fixture 中可用的内容。</p>
      </section>
    );
  }

  return (
    <section className="page-state page-state-error" role="alert">
      <span className="page-state-mark" aria-hidden="true">
        !
      </span>
      <h2>{errorMessage}</h2>
      <p>未使用未校验数据，也没有连接外部服务。</p>
      <button type="button" onClick={onRetry}>
        重试
      </button>
    </section>
  );
}
