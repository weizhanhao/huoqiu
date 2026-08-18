import type { Metadata } from "next";

import { EmailPanel } from "../../../features/profile-settings/email-panel";
import styles from "../../../features/profile-settings/profile-settings.module.css";

/*
 * 账号绑定。
 *
 * 这一页对应三项：设置登录邮箱、绑定手机号、绑定微信。
 *
 * 邮箱这一项现在是真的：改完之后旧地址登不进来、新地址能登进来，
 * 而且必须验当前密码——改登录邮箱等于改登录入口，只凭一个已登录的会话
 * 就能改掉它，那么任何一次会话泄露都会直接变成账号被夺走。
 *
 * 手机号与微信做不了真的：短信验证码需要短信通道，微信绑定需要开放平台
 * 资质，两样都没有。更要紧的是——照着别家产品摆一个脱敏的「已绑定手机号
 * 130****778」出来，就是凭空造一条不存在的绑定记录给用户看。那不是实现
 * 功能，是编造事实。所以这里如实写明未接入，也不放点了没反应的按钮。
 */
export const metadata: Metadata = {
  description: "登录邮箱、手机号与第三方账号绑定状态",
  title: "账号绑定 · 火球",
};

export default function SettingsBindingPage() {
  return (
    <section
      aria-labelledby="binding-heading"
      className={styles.contentSection}
    >
      <div className={styles.panelIntroduction}>
        <h3 id="binding-heading">登录方式</h3>
        <p>登录邮箱已接入真实账号；未接入的方式不显示虚假绑定状态。</p>
      </div>

      <div className={styles.bindingGrid}>
        <article className={styles.bindingCard}>
          <h4>登录邮箱</h4>
          <EmailPanel />
        </article>

        <article className={styles.bindingCard}>
          <h4>其他登录方式</h4>
          <p className={styles.bindingState}>
            手机号和微信登录尚未接入。它们需要短信通道或微信开放平台资质，因此暂不提供操作入口。
          </p>
        </article>
      </div>
    </section>
  );
}
