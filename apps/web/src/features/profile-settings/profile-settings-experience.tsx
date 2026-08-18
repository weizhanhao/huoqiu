"use client";

import Link from "next/link";

import { ThemeToggle } from "../theme/theme-toggle";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  profileTabItems,
  profileTabLabels,
  profileTabs,
  type ProfileTab,
} from "./profile-fixtures";
import styles from "./profile-settings.module.css";
import { useProfileSession } from "./profile-session";
import { useAccountSession } from "../account/account-session";

const unavailableSettings = [
  {
    description: "真实身份、密码与设备管理未接入。",
    id: "account-security",
    label: "账号与安全",
  },
  {
    description: "不会调用摄像头，也不会生成或识别二维码。",
    id: "scan-pc",
    label: "扫一扫登录 PC",
  },
  {
    description: "不提供基金开户、申购或赎回服务。",
    id: "fund-account",
    label: "基金账户",
  },
  {
    description: "不提供证券开户、交易或资产查询服务。",
    id: "brokerage-account",
    label: "证券账户",
  },
] as const;

function ProfileContentTabs() {
  const [activeTab, setActiveTab] = useState<ProfileTab>("activity");
  // 从 profileTabs 派生，加标签时不会再漏掉某一项。
  const tabRefs = useRef<Record<ProfileTab, HTMLButtonElement | null>>(
    Object.fromEntries(profileTabs.map((tab) => [tab, null])) as Record<
      ProfileTab,
      HTMLButtonElement | null
    >,
  );

  const activateTab = (tab: ProfileTab) => {
    setActiveTab(tab);
    tabRefs.current[tab]?.focus();
  };

  const handleTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentTab: ProfileTab,
  ) => {
    const currentIndex = profileTabs.indexOf(currentTab);
    let nextTab: ProfileTab | undefined;

    switch (event.key) {
      case "ArrowLeft":
        nextTab =
          profileTabs[
            (currentIndex - 1 + profileTabs.length) % profileTabs.length
          ];
        break;
      case "ArrowRight":
        nextTab = profileTabs[(currentIndex + 1) % profileTabs.length];
        break;
      case "End":
        nextTab = profileTabs.at(-1);
        break;
      case "Home":
        nextTab = profileTabs[0];
        break;
      default:
        return;
    }

    event.preventDefault();
    if (nextTab) activateTab(nextTab);
  };

  return (
    <section
      aria-labelledby="profile-content-heading"
      className={styles.contentSection}
    >
      <div className={styles.sectionHeading}>
        <h3 id="profile-content-heading">我的公开内容</h3>
        <span className={styles.fixturePill}>固定 fixture</span>
      </div>
      <div aria-label="用户主页内容" className={styles.tabs} role="tablist">
        {profileTabs.map((tab) => (
          <button
            aria-controls={`profile-panel-${tab}`}
            aria-selected={activeTab === tab}
            className={styles.tab}
            id={`profile-tab-${tab}`}
            key={tab}
            onClick={() => activateTab(tab)}
            onKeyDown={(event) => handleTabKeyDown(event, tab)}
            ref={(element) => {
              tabRefs.current[tab] = element;
            }}
            role="tab"
            tabIndex={activeTab === tab ? 0 : -1}
            type="button"
          >
            {profileTabLabels[tab]}
          </button>
        ))}
      </div>

      {profileTabs.map((tab) => (
        <div
          aria-labelledby={`profile-tab-${tab}`}
          className={styles.tabPanel}
          hidden={activeTab !== tab}
          id={`profile-panel-${tab}`}
          key={tab}
          role="tabpanel"
          tabIndex={activeTab === tab ? 0 : -1}
        >
          <ol className={styles.contentList}>
            {profileTabItems[tab].map((item) => (
              <li className={styles.contentItem} key={item.title}>
                <Link className={styles.contentLink} href={item.href}>
                  <span className={styles.contentMeta}>{item.meta}</span>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

export function ProfilePageExperience() {
  const {
    clearFeedback,
    errors,
    preferences,
    profile,
    resetProfile,
    saveProfile,
    status,
  } = useProfileSession();
  const [editing, setEditing] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState(profile.displayName);
  const [bioDraft, setBioDraft] = useState(profile.bio);
  const displayNameInputRef = useRef<HTMLInputElement>(null);
  const bioInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) displayNameInputRef.current?.focus();
  }, [editing]);

  const beginEditing = () => {
    clearFeedback();
    setDisplayNameDraft(profile.displayName);
    setBioDraft(profile.bio);
    setEditing(true);
  };

  const cancelEditing = () => {
    clearFeedback();
    setDisplayNameDraft(profile.displayName);
    setBioDraft(profile.bio);
    setEditing(false);
  };

  const submitProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = saveProfile({
      bio: bioDraft,
      displayName: displayNameDraft,
    });
    if (Object.keys(nextErrors).length === 0) {
      setEditing(false);
      return;
    }
    if (nextErrors.displayName) {
      displayNameInputRef.current?.focus();
    } else if (nextErrors.bio) {
      bioInputRef.current?.focus();
    }
  };

  const restoreProfile = () => {
    resetProfile();
    setEditing(false);
  };

  return (
    <section
      aria-labelledby="profile-heading"
      className={`${styles.page} ${styles.profilePage}`}
      data-testid="profile-page"
    >
      <header className={styles.profileHero}>
        <p className={styles.heroKicker}>演示身份 · 仅本次会话</p>
        <span aria-hidden="true" className={styles.avatar}>
          {profile.avatarInitials}
        </span>
        <div className={styles.profileIdentity}>
          <p className={styles.identityLabel}>固定样本身份</p>
          {/*
            这一页整页没有 h1——读屏按 1 键跳不到主标题，只能一路 Tab。
            设置页的 h1 由 settings/layout.tsx 的 SettingsHeading 给，
            这一页没有那层布局，所以主标题自己就该是 h1。
          */}
          <h1 id="profile-heading">{profile.displayName}</h1>
          <p className={styles.handle}>{profile.handle}</p>
          <p className={styles.bio}>{profile.bio || "暂未填写简介"}</p>
        </div>
        <div className={styles.heroActions}>
          <button
            className={styles.primaryButton}
            onClick={beginEditing}
            type="button"
          >
            编辑资料
          </button>
          <Link className={styles.inverseLink} href="/settings">
            设置
          </Link>
        </div>
      </header>

      <dl aria-label="演示账户统计" className={styles.statsGrid}>
        <div className={styles.statCard}>
          <dt>动态</dt>
          <dd>{profile.stats.posts} 动态</dd>
        </div>
        <div className={styles.statCard}>
          <dt>收藏</dt>
          <dd>{profile.stats.favorites} 收藏</dd>
        </div>
        {preferences.showSocialStats ? (
          <>
            <div className={styles.statCard}>
              <dt>关注</dt>
              <dd>{profile.stats.following} 关注</dd>
            </div>
            <div className={styles.statCard}>
              <dt>粉丝</dt>
              <dd>{profile.stats.followers} 粉丝</dd>
            </div>
          </>
        ) : null}
      </dl>


      {editing ? (
        <form
          method="post"
          aria-label="编辑个人资料"
          className={styles.editor}
          onSubmit={submitProfile}
        >
          <div className={styles.editorHeading}>
            <div>
              <p className={styles.sectionLabel}>会话资料</p>
              <h3>编辑个人资料</h3>
            </div>
            <span>保存后可在设置页继续查看</span>
          </div>
          <div className={styles.formField}>
            <div className={styles.fieldHeading}>
              <label htmlFor="profile-display-name">显示名</label>
              <span>{Array.from(displayNameDraft).length}/20</span>
            </div>
            <input
              aria-describedby={
                errors.displayName ? "profile-display-name-error" : undefined
              }
              aria-invalid={errors.displayName ? "true" : undefined}
              id="profile-display-name"
              onChange={(event) => setDisplayNameDraft(event.target.value)}
              ref={displayNameInputRef}
              value={displayNameDraft}
            />
            {errors.displayName ? (
              <p
                className={styles.fieldError}
                id="profile-display-name-error"
                role="alert"
              >
                {errors.displayName}
              </p>
            ) : null}
          </div>
          <div className={styles.formField}>
            <div className={styles.fieldHeading}>
              <label htmlFor="profile-bio">个人简介</label>
              <span>{Array.from(bioDraft).length}/80</span>
            </div>
            <textarea
              aria-describedby={errors.bio ? "profile-bio-error" : undefined}
              aria-invalid={errors.bio ? "true" : undefined}
              id="profile-bio"
              onChange={(event) => setBioDraft(event.target.value)}
              ref={bioInputRef}
              value={bioDraft}
            />
            {errors.bio ? (
              <p
                className={styles.fieldError}
                id="profile-bio-error"
                role="alert"
              >
                {errors.bio}
              </p>
            ) : null}
          </div>
          <div className={styles.formActions}>
            <button className={styles.primaryButton} type="submit">
              保存资料
            </button>
            <button
              className={styles.secondaryButton}
              onClick={cancelEditing}
              type="button"
            >
              取消
            </button>
          </div>
        </form>
      ) : null}
      {status ? (
        <p aria-live="polite" className={styles.statusMessage}>
          {status}
        </p>
      ) : null}
      <button
        className={styles.restoreButton}
        onClick={restoreProfile}
        type="button"
      >
        恢复固定资料
      </button>
      <ProfileContentTabs />
    </section>
  );
}

function SessionIdentity() {
  const { account, loading } = useAccountSession();

  if (loading) {
    return (
      <section
        aria-labelledby="settings-profile-heading"
        className={styles.sessionSummary}
      >
        <div className={styles.sessionIdentity}>
          <p className={styles.sectionLabel}>当前账号</p>
          <h3 id="settings-profile-heading">正在读取账号……</h3>
        </div>
      </section>
    );
  }

  if (account === null) {
    return (
      <section
        aria-labelledby="settings-profile-heading"
        className={styles.sessionSummary}
      >
        <div className={styles.sessionIdentity}>
          <p className={styles.sectionLabel}>当前账号</p>
          <h3 id="settings-profile-heading">未登录</h3>
          <span>
            <Link href="/login">登录</Link>后同步账号资料与偏好。
          </span>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="settings-profile-heading"
      className={styles.sessionSummary}
    >
      <div className={styles.sessionIdentity}>
        <p className={styles.sectionLabel}>当前账号</p>
        <h3 id="settings-profile-heading">{account.displayName}</h3>
        <span>注册于 {account.createdAt.slice(0, 10)}</span>
      </div>
      <dl aria-label="当前账号统计" className={styles.summaryStats}>
        <div>
          <dt>发帖</dt>
          <dd>{account.postCount}</dd>
        </div>
        <div>
          <dt>粉丝</dt>
          <dd>{account.followerCount}</dd>
        </div>
        <div>
          <dt>关注</dt>
          <dd>{account.followingCount}</dd>
        </div>
      </dl>
    </section>
  );
}

export function SettingsPageExperience() {
  const {
    preferences,
    setReducedMotion,
    setImageWatermark,
    setSocialStatsVisibility,
    status,
  } = useProfileSession();

  return (
    <section
      className={`${styles.page} ${styles.settingsPage}`}
      data-testid="settings-page"
    >
      <SessionIdentity />

      <section
        aria-labelledby="display-preferences-heading"
        className={styles.settingsCard}
      >
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="display-preferences-heading">界面与内容</h3>
            <p>按你的阅读习惯调整主题、动效与公开数据展示。</p>
          </div>
          <span className={styles.fixturePill}>会话级</span>
        </div>
        {/*
          主题选择是这一区里唯一会写入浏览器存储的项，所以它自己说明这一点。
          持久化本身放在 features/theme 里，本文件不直接接触存储。
        */}
        <div className={styles.preferenceRow}>
          <span>
            <strong>配色主题</strong>
            <small>浅色与深色都已适配；选择会保存在本机浏览器。</small>
          </span>
          <ThemeToggle />
        </div>
        <div className={styles.preferenceRow}>
          <span>
            <strong>减少界面动效</strong>
            <small>停用本站内非必要的动画与过渡。</small>
          </span>
          <button
            aria-checked={preferences.reducedMotion}
            aria-label="减少界面动效"
            className={styles.switchControl}
            onClick={() => setReducedMotion(!preferences.reducedMotion)}
            role="switch"
            type="button"
          >
            {preferences.reducedMotion ? "已开启" : "未开启"}
          </button>
        </div>
        <div className={styles.preferenceRow}>
          <span>
            <strong>显示关注与粉丝统计</strong>
            <small>关闭后，主页只显示动态与收藏统计。</small>
          </span>
          <button
            aria-checked={preferences.showSocialStats}
            aria-label="显示关注与粉丝统计"
            className={styles.switchControl}
            onClick={() =>
              setSocialStatsVisibility(!preferences.showSocialStats)
            }
            role="switch"
            type="button"
          >
            {preferences.showSocialStats ? "已显示" : "已隐藏"}
          </button>
        </div>
        <div className={styles.preferenceRow}>
          <span>
            <strong>为本地图片加水印</strong>
            <small>
              发帖选图后，在图片右下角写上你的昵称。图片始终只在本机预览，
              水印也在本机绘制，不会上传网络。
            </small>
          </span>
          <button
            aria-checked={preferences.watermarkImages}
            aria-label="为本地图片加水印"
            className={styles.switchControl}
            onClick={() => setImageWatermark(!preferences.watermarkImages)}
            role="switch"
            type="button"
          >
            {preferences.watermarkImages ? "已开启" : "未开启"}
          </button>
        </div>
        {status ? (
          <p aria-live="polite" className={styles.statusMessage}>
            {status}
          </p>
        ) : null}
      </section>

      <nav aria-label="相关产品入口" className={styles.productLinks}>
        {(
          [
            {
              description: "查看回复、提及、赞与系统消息",
              href: "/notifications",
              icon: "消",
              label: "消息中心",
            },
            {
              description: "管理自选列表与实时行情",
              href: "/watchlist",
              icon: "自",
              label: "自选设置",
            },
            {
              description: "查看组合、榜单与调仓记录",
              href: "/portfolios",
              icon: "组",
              label: "组合设置",
            },
            {
              description: "查看你收藏过的帖子",
              href: "/bookmarks",
              icon: "藏",
              label: "收藏",
            },
            {
              description: "使用真实行情记录虚拟买卖",
              href: "/trade",
              icon: "拟",
              label: "模拟交易",
            },
          ] as const
        ).map(({ description, href, icon, label }) => (
          <Link href={href} key={href}>
            <span className={styles.productIcon} aria-hidden="true">
              {icon}
            </span>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </nav>

      <section
        aria-labelledby="unavailable-settings-heading"
        className={`${styles.settingsCard} ${styles.capabilitySection}`}
      >
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="unavailable-settings-heading">账户与交易能力</h3>
            <p>涉及真实身份、账户或交易的能力暂未接入。</p>
          </div>
          <span className={styles.unavailablePill}>全部未接入</span>
        </div>
        <ul className={styles.unavailableList}>
          {unavailableSettings.map((setting) => (
            <li className={styles.unavailableRow} key={setting.id}>
              <span>
                <strong>{setting.label}</strong>
                <small id={`${setting.id}-reason`}>
                  演示环境未接入，无法操作 · {setting.description}
                </small>
              </span>
              <button
                aria-describedby={`${setting.id}-reason`}
                disabled
                type="button"
              >
                未接入
              </button>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
