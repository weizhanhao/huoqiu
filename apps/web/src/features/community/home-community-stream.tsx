import Link from "next/link";

import { CommunityFeedCard } from "./community-feed-card";
import styles from "./community-experience.module.css";
import { homeCommunityFeedCards } from "./home-community-fixtures";

export function HomeCommunityStream() {
  return (
    <section
      className={styles.homeStream}
      aria-labelledby="home-community-heading"
      data-testid="home-community-stream"
    >
      <header className={styles.streamHeading}>
        <div>
          <p className={styles.eyebrow}>社区内容</p>
          <h2 id="home-community-heading">社区热帖与长文</h2>
          <p>栏目记录与用户内容，均为本地数据，不含真实财经资讯。</p>
        </div>
        <Link className={styles.streamLink} href="/community">
          浏览完整社区
        </Link>
      </header>
      <div className={styles.feed}>
        {homeCommunityFeedCards.map((card) => (
          <CommunityFeedCard card={card} key={card.id} />
        ))}
      </div>
    </section>
  );
}
