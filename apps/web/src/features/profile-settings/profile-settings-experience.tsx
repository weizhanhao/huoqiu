"use client";

import Link from "next/link";
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
  {
    description: "模拟交易尚未接入，不会记录委托或收益。",
    id: "paper-trading",
    label: "模拟交易",
  },
] as const;

function ProfileContentTabs() {
  const [activeTab, setActiveTab] = useState<ProfileTab>("activity");
  const tabRefs = useRef<Record<ProfileTab, HTMLButtonElement | null>>({
    activity: null,
    favorites: null,
    following: null,
  });

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
        nextTab = profileTabs[(currentIndex - 1 + profileTabs.length) % 3];
        break;
      case "ArrowRight":
        nextTab = profileTabs[(currentIndex + 1) % 3];
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

      <div
        aria-labelledby={`profile-tab-${activeTab}`}
        className={styles.tabPanel}
        id={`profile-panel-${activeTab}`}
        role="tabpanel"
        tabIndex={0}
      >
        <ol className={styles.contentList}>
          {profileTabItems[activeTab].map((item) => (
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
        <p className={styles.heroKicker}>
          FIXED SYNTHETIC IDENTITY / SESSION ONLY
        </p>
        <span aria-hidden="true" className={styles.avatar}>
          {profile.avatarInitials}
        </span>
        <div className={styles.profileIdentity}>
          <p className={styles.identityLabel}>固定合成身份</p>
          <h2 id="profile-heading">{profile.displayName}</h2>
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

      <aside aria-label="资料数据说明" className={styles.disclosure}>
        <span aria-hidden="true">演</span>
        <div>
          <strong>演示数据 / 合成数据 · 不构成投资建议</strong>
          <p>资料变更只在当前客户端路由会话保留；刷新后恢复固定 fixture。</p>
        </div>
      </aside>

      {editing ? (
        <form
          aria-label="编辑个人资料"
          className={styles.editor}
          onSubmit={submitProfile}
        >
          <div className={styles.editorHeading}>
            <div>
              <p className={styles.sectionLabel}>SESSION PROFILE</p>
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

export function SettingsPageExperience() {
  const {
    preferences,
    profile,
    setReducedMotion,
    setSocialStatsVisibility,
    status,
  } = useProfileSession();

  return (
    <section
      aria-labelledby="settings-heading"
      className={`${styles.page} ${styles.settingsPage}`}
      data-testid="settings-page"
    >
      <header className={styles.settingsHero}>
        <div className={styles.settingsHeroCopy}>
          <p className={styles.heroKicker}>
            SESSION PREFERENCES / SYNTHETIC ACCOUNT
          </p>
          <h2 id="settings-heading">设置</h2>
          <p>仅管理本次浏览会话中的演示资料与显示偏好。</p>
        </div>
        <Link className={styles.inverseLink} href={`/users/${profile.userId}`}>
          返回用户主页
        </Link>
      </header>

      <aside aria-label="设置数据说明" className={styles.disclosure}>
        <span aria-hidden="true">演</span>
        <div>
          <strong>演示环境 · 不采集个人信息</strong>
          <p>本页不连接 API、数据库或真实账户；刷新后恢复固定 fixture。</p>
        </div>
      </aside>

      <section
        aria-labelledby="settings-profile-heading"
        className={styles.sessionSummary}
      >
        <div className={styles.sessionIdentity}>
          <p className={styles.sectionLabel}>当前会话资料</p>
          <h3 id="settings-profile-heading">{profile.displayName}</h3>
          <span>{profile.handle}</span>
        </div>
        <dl aria-label="当前会话统计" className={styles.summaryStats}>
          <div>
            <dt>动态</dt>
            <dd>{profile.stats.posts}</dd>
          </div>
          <div>
            <dt>收藏</dt>
            <dd>{profile.stats.favorites}</dd>
          </div>
          <div>
            <dt>关注</dt>
            <dd>{profile.stats.following}</dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="display-preferences-heading"
        className={styles.settingsCard}
      >
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="display-preferences-heading">显示偏好</h3>
            <p>偏好只在当前会话保留，不写入浏览器存储。</p>
          </div>
          <span className={styles.fixturePill}>会话级</span>
        </div>
        <div className={styles.preferenceRow}>
          <span>
            <strong>减少界面动效</strong>
            <small>停用本演示站点内非必要的动画与过渡。</small>
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
        {status ? (
          <p aria-live="polite" className={styles.statusMessage}>
            {status}
          </p>
        ) : null}
      </section>

      <nav aria-label="已接入的产品页面" className={styles.productLinks}>
        <Link href="/notifications">
          <span className={styles.productIcon} aria-hidden="true">
            消
          </span>
          <span>
            <strong>消息中心</strong>
            <small>查看回复、提及、赞与系统演示消息</small>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
        <Link href="/watchlist">
          <span className={styles.productIcon} aria-hidden="true">
            自
          </span>
          <span>
            <strong>自选设置</strong>
            <small>管理当前会话中的合成自选标的</small>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
        <Link href="/portfolios">
          <span className={styles.productIcon} aria-hidden="true">
            组
          </span>
          <span>
            <strong>组合设置</strong>
            <small>查看合成组合、榜单与调仓记录</small>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      </nav>

      <section
        aria-labelledby="unavailable-settings-heading"
        className={styles.settingsCard}
      >
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="unavailable-settings-heading">账户与交易能力</h3>
            <p>以下能力涉及真实身份、账户或交易，本演示环境不提供。</p>
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
