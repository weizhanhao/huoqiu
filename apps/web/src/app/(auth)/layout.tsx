import Link from "next/link";
import type { ReactNode } from "react";

import { RealIndexCards } from "../../components/shell/real-index-cards";
import { AuthHotBoard } from "./auth-hot-board";
import styles from "./auth-shell.module.css";

/*
 * 登录与注册的独立外壳。
 *
 * 这两页此前套在整站外壳里：左侧导航、顶栏搜索、右栏的热股榜和热门基金
 * 全都在。那是矛盾的——一边让人登录，一边在旁边摆一排需要登录才能用的
 * 入口，注意力被扯散，而那些入口这时候点了也没用。
 *
 * 所以这里只留两样：回首页的标识，和表单本身。
 *
 * 路由组的括号名不进地址，所以 URL 仍然是 /login 和 /register。
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        {/* 唯一的出口：让人能退回站内，而不是把他困在这一屏。 */}
        <Link className={styles.brand} href="/">
          火球
        </Link>
      </header>

      {/*
        两栏：左边说明这是什么站，右边是表单。
        原先只有中间一张裸表单浮在灰底上——一个财经站的门面不该只是一个
        输入框。左栏写的都是这个站真的在做的事，不写做不到的。
      */}
      <main className={styles.main}>
        <section className={styles.intro}>
          <p className={styles.kicker}>火球</p>
          <h2 className={styles.tagline}>
            看<em>真实</em>的行情，记自己的判断
          </h2>
          <p className={styles.introNote}>
            沪深行情、基金与 ETF、上市公司公告与私募登记信息，全部来自公开
            数据源；组合与模拟交易按真实价格计算。
          </p>
          <ul className={styles.points}>
            <li>行情、公告、快讯取自公开接口，页面不以样本数据代替</li>
            <li>账号、帖子与关注关系保存在本机服务端</li>
            <li>不接入第三方登录，邮箱与密码不出本机</li>
          </ul>

          {/*
            真的指数，不是配图。
            上面那句「行情取自公开接口」说完就该能当场看到——写一句承诺、
            旁边配一张示意图，正是这一轮一直在清的东西。
          */}
          <div className={styles.marketStrip}>
            <RealIndexCards />
          </div>

          {/* 指数条只有三个数，下面还空一大片；热榜填的是真行情，不是配图。 */}
          <AuthHotBoard />
        </section>

        <div className={styles.formSlot}>{children}</div>
      </main>

      <footer className={styles.footer}>
        <p>本站为本地预览环境，账号与内容都保存在这台机器上，不上传网络。</p>
      </footer>
    </div>
  );
}
