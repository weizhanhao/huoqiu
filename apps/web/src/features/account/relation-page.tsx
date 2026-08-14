import Link from "next/link";
import { notFound } from "next/navigation";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { FollowButton } from "./follow-button";
import {
  loadProfile,
  loadRelation,
  type RelationKind,
} from "./profile-lookup.server";
import styles from "./account.module.css";

/*
 * 关注 / 粉丝名单页。两条路由共用一套渲染，只有称谓和空态文案不同。
 *
 * 名单每一行都可点进对方主页，并带一个真实的关注按钮——雪球的关注列表
 * 就是这样，能在列表里直接回关。
 */

const COPY: Record<RelationKind, { empty: string; label: string }> = {
  followers: {
    empty: "还没有人关注 TA。",
    label: "粉丝",
  },
  following: {
    empty: "TA 还没有关注任何人。",
    label: "关注",
  },
};

export async function RelationPage({
  kind,
  params,
}: Readonly<{
  kind: RelationKind;
  params: Promise<{ userId: string }>;
}>) {
  const { userId } = await params;
  const profile = loadProfile(userId);
  if (profile === null) {
    notFound();
  }

  const entries = loadRelation(userId, kind);
  const copy = COPY[kind];

  return (
    <DesktopShell activeUtility="profile">
      <div className={styles.page}>
        <section className={styles.card}>
          <div className={styles.heading}>
            <h1>
              {profile.displayName} 的{copy.label}
            </h1>
            <p>
              共 {entries.length} 人。名单只列出确实存在、可以打开主页的账号。
            </p>
          </div>
          <p className={styles.switchLine}>
            <Link href={`/users/${profile.id}`}>返回 TA 的主页</Link>
          </p>

          {entries.length === 0 ? (
            <p className={styles.hint}>{copy.empty}</p>
          ) : (
            <div className={styles.directory}>
              {entries.map((entry) => (
                <div className={styles.directoryRow} key={entry.id}>
                  <div>
                    <strong>
                      <Link href={`/users/${entry.id}`}>
                        {entry.displayName}
                      </Link>
                    </strong>
                    <small>{entry.role}</small>
                  </div>
                  <FollowButton
                    targetId={entry.id}
                    targetName={entry.displayName}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DesktopShell>
  );
}
