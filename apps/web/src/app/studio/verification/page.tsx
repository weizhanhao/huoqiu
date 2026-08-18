import type { Metadata } from "next";

import styles from "../../../features/studio/studio-page.module.css";

export const metadata: Metadata = {
  description: "账号认证的入口与说明",
  title: "账号认证 · 创作者中心 · 火球",
};

/*
 * 账号认证。
 *
 * 这一页只有说明，没有入口——因为它背后是真实的身份核验：实名要对接
 * 公民身份信息，机构要核验营业执照。站内没有这套能力，也不该有。
 *
 * 做一个填完表就发个 V 标的流程，是这整个项目一直在清的那类东西：
 * 看起来完整、点得动、有反馈，而背后什么都没有发生。认证尤其不能这么做——
 * 一个假的身份标识会让别人据此信任一个未经核验的账号。
 */
export default function StudioVerificationPage() {
  return (
    <section className={styles.card}>
      <h2 className={styles.heading}>账号认证</h2>
      <p className={styles.subheading}>
        认证用来标明账号背后的真实身份，常见的有实名认证、个人身份认证与公司机构认证。
      </p>

      <p className={styles.statusBar}>
        站内暂不提供认证。它需要对接真实的身份核验渠道（实名信息、营业执照等），
        我们没有这套能力。
      </p>

      <p className={styles.explanation}>
        这里没有做一个走完流程就发放标识的界面：一个未经核验就发出去的身份标识，
        会让其他用户据此信任一个其实没有被核验过的账号——那比没有认证更危险。
      </p>
    </section>
  );
}
