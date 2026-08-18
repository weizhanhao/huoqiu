import type { ReactNode } from "react";

import { RealIndexCards } from "../../components/shell/real-index-cards";
import { SiteTopbar } from "../../components/shell/site-topbar";
import { AuthHotBoard } from "./auth-hot-board";
import styles from "./auth-shell.module.css";

/*
 * 登录与注册的独立外壳。
 *
 * 这两页此前套在整站外壳里：左侧导航、顶栏搜索、右栏的热股榜和热门基金
 * 全都在。那是矛盾的——一边让人登录，一边在旁边摆一排需要登录才能用的
 * 入口，注意力被扯散，而那些入口这时候点了也没用。
 *
 * 所以这里只留认证所需内容：回首页的标识、真实行情上下文和表单本身；
 * 不带站内导航，也不伪造一套登录页专用数据。
 *
 * 路由组的括号名不进地址，所以 URL 仍然是 /login 和 /register。
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className={`d0-app-shell ${styles.page}`}>
      {/* 与首页复用同一顶栏，尺寸、品牌位置和响应式行为只有一个真相源。 */}
      <SiteTopbar variant="auth" />

      {/*
        两栏：左边用真实行情说明产品定位，右边只做认证。
        视觉上沿用站内蓝色顶栏、数据字体和细分隔线，不另造一套落地页风格。
      */}
      <main className={styles.main}>
        <section className={styles.intro}>
          <p className={styles.kicker}>行情与观点，在同一个坐标里</p>
          <h2 className={styles.tagline}>
            在<em>真实行情</em>里，找到值得关注的判断
          </h2>
          <p className={styles.introNote}>
            火球把公开市场数据、社区讨论和个人组合放在一起。登录后继续查看
            关注、消息与自己的投资记录。
          </p>
          <ul className={styles.points}>
            <li>行情、榜单与公告取自公开数据接口</li>
            <li>关注、帖子与组合归属于真实账号</li>
            <li>邮箱不会展示在公开个人主页</li>
          </ul>

          {/*
            真的指数，不是配图。
            上面那句「行情取自公开接口」说完就该能当场看到——写一句承诺、
            旁边配一张示意图，正是这一轮一直在清的东西。
          */}
          <div className={styles.marketPanel}>
            <div className={styles.marketHeading}>
              <strong>市场概览</strong>
              <span>公开行情</span>
            </div>
            <div className={styles.marketStrip}>
              <RealIndexCards />
            </div>
          </div>

          {/* 指数条只有三个数，下面还空一大片；热榜填的是真行情，不是配图。 */}
          <AuthHotBoard />
        </section>

        <div className={styles.formSlot}>{children}</div>
      </main>

      <footer className={styles.footer}>
        <p>行情数据来自公开接口，不构成投资建议。</p>
        <p>账号与内容保存在当前服务端。</p>
      </footer>
    </div>
  );
}
