"use client";

import Link from "next/link";

import benefitStyles from "./studio-benefits.module.css";
import { useStudioData } from "./studio-data";
import styles from "./studio-page.module.css";

type Condition = Readonly<{ label: string; met: boolean }>;

function ConditionList({ items }: Readonly<{ items: readonly Condition[] }>) {
  return (
    <ul className={benefitStyles.conditions}>
      {items.map((item) => (
        <li className={benefitStyles.condition} key={item.label}>
          <span
            aria-hidden="true"
            className={item.met ? benefitStyles.checkMet : benefitStyles.check}
          >
            {item.met ? "✓" : "·"}
          </span>
          <span className={benefitStyles.conditionLabel}>{item.label}</span>
          <span className={item.met ? benefitStyles.met : benefitStyles.unmet}>
            {item.met ? "已满足" : "待完成"}
          </span>
        </li>
      ))}
    </ul>
  );
}

const progressOf = (items: readonly Condition[]): number =>
  Math.round((items.filter((item) => item.met).length / items.length) * 100);

export function StudioBenefits() {
  const { state } = useStudioData();

  if (state.kind === "anonymous") {
    return (
      <section className={styles.card}>
        <p className={styles.statusBar}>
          <Link href="/login">登录</Link>后可以看到自己的权益进度。
        </p>
      </section>
    );
  }
  if (state.kind === "loading") {
    return (
      <section
        aria-busy="true"
        aria-label="正在读取权益进度"
        className={styles.loadingCard}
      >
        <span className={styles.loadingTitle} />
        <div className={styles.loadingRows}>
          <span />
          <span />
          <span />
        </div>
      </section>
    );
  }
  if (state.kind === "failed") {
    return (
      <section className={styles.card}>
        <p className={styles.statusBar}>数据暂时取不到。</p>
      </section>
    );
  }

  const { followerCount, posts, stats } = state.data;
  const articleCount = posts.filter(
    (post) => post.kind === "article" && post.status === "published",
  ).length;
  const interactions = stats.commentCount + stats.likeCount;
  const columnConditions: readonly Condition[] = [
    { label: "发布 5 篇长文", met: articleCount >= 5 },
    { label: "长文累计互动达到 20 次", met: interactions >= 20 },
    { label: "遵守社区规则", met: true },
  ];
  const rewardConditions: readonly Condition[] = [
    { label: "粉丝数超过 500", met: followerCount > 500 },
    { label: "累计原发帖超过 6 篇", met: stats.publishedCount > 6 },
    { label: "累计互动超过 50 次", met: interactions > 50 },
  ];

  return (
    <div className={benefitStyles.page}>
      <header className={benefitStyles.hero}>
        <span aria-hidden="true" className={benefitStyles.heroIcon}>
          ✦
        </span>
        <div>
          <p>创作者权益</p>
          <h1>持续创作，解锁更多能力</h1>
          <span>所有进度都来自你的真实作品与互动数据。</span>
        </div>
        <span className={benefitStyles.heroBadge}>2 项能力成长中</span>
      </header>

      <div className={benefitStyles.grid}>
        <BenefitCard
          conditions={columnConditions}
          description="获得专栏标识与更多内容推荐机会"
          footer="继续完成条件；审核通道开放后即可申请。"
          icon="专"
          status="审核暂未开放"
          title="创作者专栏"
        />
        <BenefitCard
          conditions={rewardConditions}
          description="让优质创作获得读者支持与讨论激励"
          footer="涉及真实资金结算，支付能力接入前不开放申请。"
          icon="赏"
          status="支付暂未接入"
          title="打赏与悬赏"
        />
      </div>

      <aside className={benefitStyles.truthNote}>
        <span aria-hidden="true">i</span>
        <p>
          <strong>进度真实，可用性透明</strong>
          条件按账号数据实时计算；站内没有审核或支付能力时，不提供虚假的开通按钮。
        </p>
      </aside>
    </div>
  );
}

function BenefitCard({
  conditions,
  description,
  footer,
  icon,
  status,
  title,
}: Readonly<{
  conditions: readonly Condition[];
  description: string;
  footer: string;
  icon: string;
  status: string;
  title: string;
}>) {
  const progress = progressOf(conditions);

  return (
    <section className={benefitStyles.benefitCard}>
      <header className={benefitStyles.cardHeader}>
        <span aria-hidden="true" className={benefitStyles.cardIcon}>
          {icon}
        </span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={benefitStyles.statusChip}>{status}</span>
      </header>
      <div className={benefitStyles.progressHeader}>
        <span>解锁进度</span>
        <strong>{progress}%</strong>
      </div>
      <div aria-hidden="true" className={benefitStyles.progressTrack}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <ConditionList items={conditions} />
      <footer className={benefitStyles.cardFooter}>
        <span aria-hidden="true">⌁</span>
        {footer}
      </footer>
    </section>
  );
}
