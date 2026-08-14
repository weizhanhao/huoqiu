"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { PostComposer } from "./post-composer";
import styles from "./publish-dialog.module.css";

/*
 * 发帖入口 + 弹框。
 *
 * 用原生 <dialog>：焦点陷阱、Esc 关闭、背景惰性化都是浏览器自带的。
 * 自己拿 div 搭一个，这三样都得手写，而漏掉任何一样，键盘用户都会
 * 掉进一个关不掉、也退不出去的框里。
 *
 * 触发器是**链接**不是按钮，指向 /publish 那一页，有 JS 时拦截点击改开
 * 弹框。换成按钮的话，没有 JS 的人点下去毫无反应——而 /publish 那一页
 * 明明还在，只是没人链接得到它了。渐进增强两边都不落空。
 *
 * 框体到第一次点开才挂载。站内有三个发帖入口（顶栏、侧栏、移动端浮标），
 * 一直挂着就是每一页都躺着三份一模一样的编辑器——三套表单控件、三份
 * 隐藏的可聚焦节点。绝大多数访问一次都不会点开。
 *
 * 触发器的外观由调用方传 className 和 children 决定，不是回调。原先这里
 * 是 render prop：调用方给一个函数、拿走 aria 属性自己渲染。那样写单测
 * 能过、构建过不去——壳层是服务端组件，函数不能跨 RSC 边界传给客户端
 * 组件。JSX 元素可以，函数不行。
 */
export function PublishDialog({
  children,
  className,
  label,
}: Readonly<{
  children: React.ReactNode;
  className: string;
  /** 触发器自身没有可读文字时（移动端只有一个加号）补上。 */
  label?: string;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open_, setOpen] = useState(false);

  /*
   * showModal() 要等框体真的进了 DOM 才能调。点开那一下框体还没渲染，
   * 所以放在 effect 里等这一帧提交完再调。
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open_ && !dialog.open) dialog.showModal();
    if (!open_ && dialog.open) dialog.close();
  }, [open_]);

  const close = (): void => {
    setOpen(false);
  };

  return (
    <>
      <Link
        aria-expanded={open_}
        aria-haspopup="dialog"
        className={className}
        href="/publish"
        /*
         * 水合之前这里根本不会被调用——React 要到水合完成才把点击派发给
         * 处理器，在那之前它就是一条普通链接，点了直接跳 /publish。
         * 所以不需要再自己记一个「挂载了没有」的状态。
         */
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
        {...(label === undefined ? {} : { "aria-label": label })}
      >
        {children}
      </Link>
      {open_ ? (
        <dialog
          aria-label="发帖"
          className={styles.dialog}
          /* 点背景关闭：点到 dialog 元素本身就是点在了背景上。 */
          onClick={(event) => {
            if (event.target === dialogRef.current) close();
          }}
          /* Esc 关闭是浏览器行为，状态得跟上，否则 aria-expanded 会说谎。 */
          onClose={close}
          ref={dialogRef}
        >
          <div className={styles.panel}>
            <div className={styles.header}>
              <h2 className={styles.title}>有什么消息告诉大家</h2>
              <button
                aria-label="关闭"
                className={styles.close}
                onClick={close}
                type="button"
              >
                ✕
              </button>
            </div>
            {/*
              发出去就关掉。留在原地会让人以为没发成功，于是再点一次。
            */}
            <PostComposer onPublished={close} variant="modal" />
          </div>
        </dialog>
      ) : null}
    </>
  );
}
