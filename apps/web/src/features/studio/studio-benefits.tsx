"use client";

import Link from "next/link";

import styles from "./studio-page.module.css";
import benefitStyles from "./studio-benefits.module.css";
import { useStudioData } from "./studio-data";

/*
 * 创作者权益。
 *
 * 开通条件是**真的**：发够几篇长文、粉丝数、累计互动数，全都从库里数出来，
 * 所以「已满足 / 未满足」这两个字可信。
 *
 * 但「申请开通」这个动作站内没有——它背后要有审核流程；打赏与悬赏更要有
 * 真实的支付与结算。做一个点了就说「申请成功」的按钮，那是彻头彻尾的假
 * 功能，比不做糟得多。所以按钮明确禁用，并且说清楚为什么。
 */

type Condition = Readonly<{ label: string; met: boolean }>;

function ConditionList({ items }: Readonly<{ items: readonly Condition[] }>) {
  return (
    <ul className={benefitStyles.conditions}>
      {items.map((item) => (
        <li className={benefitStyles.condition} key={item.label}>
          <span>{item.label}</span>
          {/*
            只靠颜色区分对色觉障碍不够，所以文字本身就说明状态。
          */}
          <span className={item.met ? benefitStyles.met : benefitStyles.unmet}>
            {item.met ? "已满足" : "未满足"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function StudioBenefits() {
  const { state } = useStudioData();

  if (state.kind === "anonymous") {
    return (
      <section className={styles.card}>
        <p className="page-state-message">
          <Link href="/login">登录</Link>后可以看到自己的权益进度。
        </p>
      </section>
    );
  }
  if (state.kind !== "ready") {
    return (
      <section className={styles.card}>
        <p className={styles.empty}>
          {state.kind === "loading" ? "正在读取……" : "数据暂时取不到。"}
        </p>
      </section>
    );
  }

  const { followerCount, posts, stats } = state.data;
  const articleCount = posts.filter(
    (post) => post.kind === "article" && post.status === "published",
  ).length;
  const interactions = stats.commentCount + stats.likeCount;

  return (
    <div className={benefitStyles.wrap}>
      <section className={styles.card}>
        <h2 className={styles.heading}>创作者专栏</h2>
        <p className={styles.subheading}>
          开通后可获得专栏标识与更多推荐位。下面每一条都按你账号里的真实数据计算。
        </p>
        <ConditionList
          items={[
            { label: "发布 5 篇长文", met: articleCount >= 5 },
            { label: "长文累计互动达到 20 次", met: interactions >= 20 },
            { label: "遵守社区规则", met: true },
          ]}
        />
        <button className={benefitStyles.apply} disabled type="button">
          申请开通专栏
        </button>
        <p className="page-state-message">
          申请通道尚未接入：它需要一套人工审核流程，站内还没有。上面的条件与进度是真实的。
        </p>
      </section>

      <section className={styles.card}>
        <h2 className={styles.heading}>打赏与悬赏</h2>
        <p className={styles.subheading}>
          打赏让读者直接赞赏一篇帖子；悬赏是发帖时挂出赏金，分配给参与讨论的人。
        </p>
        <ConditionList
          items={[
            { label: "粉丝数超过 500", met: followerCount > 500 },
            { label: "累计原发帖超过 6 篇", met: stats.publishedCount > 6 },
            { label: "累计互动超过 50 次", met: interactions > 50 },
          ]}
        />
        <button className={benefitStyles.apply} disabled type="button">
          申请开通打赏与悬赏
        </button>
        <p className="page-state-message">
          这两项涉及真实资金的收付与结算，站内没有支付后端，因此不提供申请。
          做一个点了就提示「开通成功」的按钮，等于凭空许诺一件做不到的事。
        </p>
      </section>
    </div>
  );
}
