"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useAccountSession } from "../account/account-session";
import styles from "./instrument-detail.module.css";

/*
 * 个股讨论区的发帖入口。
 *
 * 这里原本是一条指向 /publish 的链接——在星海智造的页面上点「发讨论」，
 * 落到一个只字未提这只标的的通用编辑器，上下文全丢了。
 *
 * 现在就地发布：正文自动带上 $代码$ 标记，发出去的是一条真实帖子，
 * 落盘、出现在作者主页、有自己的永久链接。社区那套发帖能力早就通了，
 * 缺的只是从个股页到它的这条线。
 */
export function InstrumentDiscussionComposer({
  name,
  nextPath,
  symbol,
}: Readonly<{
  name: string;
  /**
   * 登录后要回到的这一页。
   *
   * 由父组件传进来，不用 `usePathname()`：那个 hook 在 app router 之外会
   * 直接抛错，页面级的静态渲染测试和浏览器 harness 都没有 router，
   * 组件会因此变得只能在真实路由里活。
   */
  nextPath: string;
  symbol: string;
}>) {
  const { account, publish } = useAccountSession();
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  if (account === null) {
    return (
      /*
        带上回跳。此前登录完停在登录页，用户得自己找回刚才那只标的，
        而他本来只是想在这一页说句话。
      */
      <Link
        className={styles.discussionLogin}
        href={`/login?next=${encodeURIComponent(nextPath)}`}
      >
        登录后参与讨论
      </Link>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const said = body.trim();
    if (said.length === 0) {
      setStatus("请输入内容后再发布。");
      return;
    }

    setPending(true);
    const failure = await publish(
      `关于 ${name} 的讨论`,
      // 标的标记放在正文里，这样这条帖子在社区流和搜索里也能被认出来。
      `$${symbol}$ ${said}`,
    );
    setPending(false);
    if (failure !== null) {
      setStatus(failure);
      return;
    }
    setBody("");
    setStatus("已发布");
    /*
     * 让下面的讨论列表把这条读回来。
     *
     * 那份列表是服务端渲染的，不重新取一次的话，刚说完的话不会出现在
     * 下面——用户会以为没发出去，然后再发一遍。
     *
     * 这里用整页重载而不是 router.refresh()：后者要 app router 上下文，
     * 会让这个组件在页面级测试和浏览器 harness 里直接抛错。
     */
    globalThis.location.reload();
  };

  return (
    <form className={styles.discussionComposer} onSubmit={submit}>
      <label className="visually-hidden" htmlFor="instrument-discussion-body">
        对 {name} 的看法
      </label>
      <input
        id="instrument-discussion-body"
        maxLength={500}
        onChange={(event) => setBody(event.target.value)}
        placeholder={`说说你对 ${name} 的看法`}
        type="text"
        value={body}
      />
      <button disabled={pending} type="submit">
        {pending ? "发布中" : "发讨论"}
      </button>
      {/* 状态位常驻，出现提示时不会把讨论列表顶下去。 */}
      <span aria-live="polite" className={styles.discussionStatus}>
        {status}
      </span>
    </form>
  );
}
