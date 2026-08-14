import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DesktopShell } from "../../../components/shell/desktop-shell";
import { FollowButton } from "../../../features/account/follow-button";
import { LockedProfileTabs } from "../../../features/account/locked-profile-tabs";
import {
  knownColumnProfileIds,
  loadProfile,
} from "../../../features/account/profile-lookup.server";
import styles from "../../../features/account/account.module.css";

/*
 * 任意用户主页。
 *
 * 注册账号是运行时才存在的，所以这条路由必须每次请求重新求值；
 * 编辑部栏目账号则在编译期就能预生成。generateStaticParams 只列后者，
 * dynamicParams 默认放行前者。
 */
export const dynamic = "force-dynamic";

type PageProperties = Readonly<{
  params: Promise<{ userId: string }>;
}>;

export function generateStaticParams(): { userId: string }[] {
  return knownColumnProfileIds().map((userId) => ({ userId }));
}

export async function generateMetadata({
  params,
}: PageProperties): Promise<Metadata> {
  const { userId } = await params;
  const profile = loadProfile(userId);
  if (profile === null) {
    return { title: "用户不存在 · 火球" };
  }
  return {
    description: profile.bio,
    title: `${profile.displayName} · 火球`,
  };
}

export default async function UserProfilePage({ params }: PageProperties) {
  const { userId } = await params;
  const profile = loadProfile(userId);
  if (profile === null) {
    notFound();
  }

  return (
    <DesktopShell activeUtility="profile">
      <div className={styles.page}>
        <section className={styles.card}>
          <div className={styles.profileHeader}>
            <span className={styles.profileAvatar} aria-hidden="true">
              {profile.initials}
            </span>
            <div className={styles.profileMeta}>
              <h1>{profile.displayName}</h1>
              <p className={styles.profileRole}>
                {profile.role} · {profile.joinedLabel}
              </p>
              <p className={styles.profileBio}>{profile.bio}</p>
              {profile.focus.length === 0 ? null : (
                <p className={styles.focusRow}>
                  {profile.focus.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </p>
              )}
            </div>
            <FollowButton
              targetId={profile.id}
              targetName={profile.displayName}
            />
          </div>

          <p className={styles.signedInStats}>
            <Link href={`/users/${profile.id}/following`}>
              关注 <strong>{profile.followingCount}</strong>
            </Link>
            <Link href={`/users/${profile.id}/followers`}>
              粉丝 <strong>{profile.followerCount}</strong>
            </Link>
            <span>
              帖子 <strong>{profile.postCount}</strong>
            </span>
          </p>
        </section>

        {/*
          页签计数。
          帖子数是公开的。回复与收藏仅本人可见，所以这里连数量都不给——
          「他收藏了 37 条」本身就泄露了活跃度，哪怕内容看不到。
          自选与组合目前不跟随账号：自选存在浏览器本地，组合只活在本次会话，
          所以显示「—」而不是编一个数字。写 0 会让人以为「确实一个都没有」。
        */}
        <section className={styles.card}>
          <p className={styles.signedInStats}>
            <span>帖子 {profile.postCount}</span>
            <span>自选 —</span>
            <span>组合 —</span>
          </p>
          <p className={styles.hint}>
            自选与组合暂未与账号关联：自选保存在当前浏览器，组合只保留在本次会话，因此这里不显示计数。
          </p>
        </section>

        <section className={styles.card}>
          <div className={styles.heading}>
            <h2>发布记录</h2>
            <p>
              {profile.isRegisteredAccount
                ? "这些是该账号本人发布并保存在本机的帖子。"
                : "这些是该栏目随产品一起录入的记录。"}
            </p>
          </div>
          {profile.posts.length === 0 ? (
            <p className={styles.hint}>该账号还没有发布过内容。</p>
          ) : (
            <div className={styles.postList}>
              {profile.posts.map((post) => (
                <article className={styles.postRow} key={post.id}>
                  <Link href={post.href}>{post.title}</Link>
                  <p>{post.body}</p>
                  <small>{post.publishedLabel}</small>
                </article>
              ))}
            </div>
          )}
        </section>

        <LockedProfileTabs ownerId={profile.id} />
      </div>
    </DesktopShell>
  );
}
