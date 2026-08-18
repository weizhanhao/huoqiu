import type { Metadata } from "next";

import styles from "../../../features/studio/studio-benefits.module.css";

export const metadata: Metadata = {
  description: "账号认证的入口与说明",
  title: "账号认证 · 创作者中心 · 火球",
};

const verificationTypes = [
  {
    description: "确认账号由真实自然人持有，提升社区身份可信度。",
    icon: "人",
    title: "实名认证",
  },
  {
    description: "适用于财经作者、行业从业者与其他专业身份。",
    icon: "V",
    title: "个人身份认证",
  },
  {
    description: "适用于企业、媒体、基金会及其他依法登记机构。",
    icon: "企",
    title: "公司机构认证",
  },
] as const;

export default function StudioVerificationPage() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <span aria-hidden="true" className={styles.heroIcon}>
          V
        </span>
        <div>
          <p>账号认证</p>
          <h1>让真实身份成为可信表达的一部分</h1>
          <span>认证标识只应发给经过真实核验的个人或机构。</span>
        </div>
        <span className={styles.heroBadge}>核验服务暂未接入</span>
      </header>

      <section aria-label="认证类型" className={styles.verificationGrid}>
        {verificationTypes.map((type) => (
          <article className={styles.verificationCard} key={type.title}>
            <span aria-hidden="true" className={styles.verificationIcon}>
              {type.icon}
            </span>
            <div>
              <h2>{type.title}</h2>
              <p>{type.description}</p>
            </div>
            <span className={styles.verificationStatus}>暂未开放</span>
          </article>
        ))}
      </section>

      <aside className={styles.truthNote}>
        <span aria-hidden="true">i</span>
        <p>
          <strong>为什么没有申请按钮？</strong>
          认证需要实名信息、资质材料和人工核验。核验能力接入前发放标识会制造虚假信任，因此当前只展示认证范围，不收集资料。
        </p>
      </aside>
    </div>
  );
}
