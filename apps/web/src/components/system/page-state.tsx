"use client";

import type { ReactNode } from "react";

import { type D0PageState, retryD0FixtureState } from "../../lib/d0-page-state";

type PageStateProperties = Readonly<{
  state: D0PageState;
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
      /*
       * aria-busy 不能挂在 live region 上。
       *
       * 这三个属性原先挂在同一个节点：role="status" + aria-live="polite" +
       * aria-busy="true"。而 aria-busy 的语义正是「这块正在变，先别处理它的
       * 更新」——等于亲手把自己的播报堵死，那句「正在加载」大概率永远不会
       * 被念出来。现在 aria-busy 挂在被替换的骨架上，播报独立出来。
       * aria-live 也去掉了：role="status" 本身就隐含 polite。
       */
      <section className="page-state page-state-loading">
        <p className="visually-hidden" role="status">
          正在加载
        </p>
        <div aria-busy="true" aria-hidden="true">
          <div className="state-skeleton" />
          <div className="state-skeleton state-skeleton-short" />
          <div className="state-skeleton" />
        </div>
      </section>
    );
  }

  if (state === "empty") {
    return (
      /*
       * 空态不是「状态消息」。
       *
       * 这里原先挂着 role="status"：一是首屏就在 DOM 里、没有变化可播，
       * 二是它因此变成一块常驻的 live region，之后任何文案改动都会打断朗读。
       *
       * 标题也从 h2 降成 p：异动、视频、私募那几块面板自己已经是 h2，
       * 空态再来一个 h2 会把各页的标题层级搅乱。
       */
      <section className="page-state">
        <span className="page-state-mark" aria-hidden="true">
          ○
        </span>
        {/*
          原先固定跟着一句「这里会展示可用的演示内容。」。自选页早就不是
          演示内容了——它列的是真实标的、真实行情。这一句已经把「空的是什么、
          怎么填」讲清楚，再补一句不实的只会更糟。
        */}
        <p className="page-state-message">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="page-state page-state-error">
      <span className="page-state-mark" aria-hidden="true">
        !
      </span>
      {/*
        role="alert" 只包住话，不包按钮。
        原先整块（标题 + 说明 + 重试按钮）都在 alert 里，而读屏播报 alert 时
        通常把内容拍扁成一段文字念完——「重试」是个按钮、能按，这件事在那一刻
        传达不出去。
      */}
      <div role="alert">
        <p className="page-state-message">{errorMessage}</p>
        {/*
          这句原先是「未使用未校验数据，也没有连接外部服务。」——后半句现在
          是假的：行情、基金、私募、视频都由服务端向站外取。前半句要守的那层
          意思（取不到就说取不到，不拿估算顶上）留下，不实的那半句去掉。
        */}
        <p>没有取到数据时不以估算或样本代替。</p>
      </div>
      <button type="button" onClick={onRetry ?? (() => retryD0FixtureState())}>
        重试
      </button>
    </section>
  );
}
