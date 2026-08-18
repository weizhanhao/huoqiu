"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useAccountSession } from "../account/account-session";
import styles from "./notification-center.module.css";
import {
  notificationCategories,
  notificationCategoryLabel,
  useNotificationSession,
  type NotificationCategoryId,
  type SyntheticNotification,
} from "./notification-state";

export type NotificationFilter = "all" | NotificationCategoryId;

type NotificationStoryProperties = Readonly<{
  notification: SyntheticNotification;
}>;

function NotificationStory({ notification }: NotificationStoryProperties) {
  return (
    <>
      <span className={styles.storyHeading}>
        <strong>{notification.actor.name}</strong>
        <span>{notification.action}</span>
      </span>
      <span className={styles.summary}>{notification.summary}</span>
      <span className={styles.targetLabel}>
        {notification.target.kind === "link"
          ? `查看：${notification.target.label}`
          : notification.target.label}
      </span>
    </>
  );
}

type NotificationCardProperties = Readonly<{
  notification: SyntheticNotification;
  onHide: (notification: SyntheticNotification) => void;
  onOpen: (notification: SyntheticNotification) => void;
  onToggleRead: (notification: SyntheticNotification) => void;
}>;

function NotificationCard({
  notification,
  onHide,
  onOpen,
  onToggleRead,
}: NotificationCardProperties) {
  const headingId = `${notification.id}-heading`;

  return (
    <article
      aria-labelledby={headingId}
      className={`${styles.card} ${
        notification.isRead ? styles.read : styles.unread
      }`}
      data-notification-target={notification.target.kind}
    >
      <div
        aria-hidden="true"
        className={`${styles.avatar} ${styles[notification.category]}`}
      >
        {notification.actor.initials}
      </div>

      <div className={styles.cardBody}>
        {notification.target.kind === "link" ? (
          <Link
            aria-label={`打开通知：${notification.actor.name}${notification.action}`}
            className={styles.storyLink}
            href={notification.target.href}
            id={headingId}
            onClick={() => onOpen(notification)}
          >
            <NotificationStory notification={notification} />
          </Link>
        ) : (
          <div className={styles.inertStory} id={headingId}>
            <NotificationStory notification={notification} />
            <span className={styles.unavailableReason}>
              {notification.target.reason}
            </span>
          </div>
        )}

        <div className={styles.cardMeta}>
          <span className={styles.categoryLabel}>
            {notificationCategoryLabel(notification.category)}
          </span>
          <time dateTime={notification.createdAt}>
            {notification.timeLabel}
          </time>
          <span
            className={
              notification.isRead ? styles.readBadge : styles.unreadBadge
            }
          >
            {notification.isRead ? "已读" : "未读"}
          </span>
        </div>
      </div>

      <div className={styles.cardActions}>
        <button
          aria-label={notification.isRead ? "标为未读" : "标为已读"}
          onClick={() => onToggleRead(notification)}
          type="button"
        >
          {notification.isRead ? "标为未读" : "标为已读"}
        </button>
        <button
          aria-label="隐藏此通知"
          onClick={() => onHide(notification)}
          type="button"
        >
          隐藏
        </button>
      </div>
    </article>
  );
}

/*
 * initialFilter 来自 URL 的 ?category= 参数。
 *
 * 侧栏那四条「回复 / @我 / 赞与收藏 / 系统消息」过去全部指向同一个
 * /notifications，点哪条落地都是默认视图——四个入口做了同一件事，
 * 和没做没区别。现在分类进 URL，链接各自直达，也可以被收藏和分享。
 */
export function NotificationCenter({
  initialFilter = "all",
}: Readonly<{ initialFilter?: NotificationFilter }> = {}) {
  const { counts, hide, markAllRead, markRead, markUnread, notifications } =
    useNotificationSession();
  const { account, loading: accountLoading } = useAccountSession();
  const [activeFilter, setActiveFilter] =
    useState<NotificationFilter>(initialFilter);
  const [announcement, setAnnouncement] = useState(
    `当前共有 ${counts.total} 条未读通知。`,
  );
  const visibleNotifications = useMemo(
    () =>
      activeFilter === "all"
        ? notifications
        : notifications.filter(({ category }) => category === activeFilter),
    [activeFilter, notifications],
  );

  const chooseFilter = (nextFilter: NotificationFilter) => {
    setActiveFilter(nextFilter);
    setAnnouncement(
      nextFilter === "all"
        ? `正在查看全部消息，共 ${notifications.length} 条。`
        : `正在查看${notificationCategoryLabel(nextFilter)}。`,
    );
  };

  const toggleRead = (notification: SyntheticNotification) => {
    if (notification.isRead) {
      markUnread(notification.id);
      setAnnouncement("已将这条通知标为未读。");
    } else {
      markRead(notification.id);
      setAnnouncement("已将这条通知标为已读。");
    }
  };

  const openNotification = (notification: SyntheticNotification) => {
    markRead(notification.id);
    setAnnouncement("通知已读，正在打开关联的内容。");
  };

  const hideNotification = (notification: SyntheticNotification) => {
    hide(notification.id);
    setAnnouncement("已在本次会话中隐藏这条通知。");
  };

  const readEverything = () => {
    markAllRead();
    setAnnouncement("全部通知已标为已读。");
  };

  return (
    <section
      aria-labelledby="notification-center-heading"
      className={styles.center}
      data-testid="notification-center"
    >
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>与你相关</p>
          <h1 id="notification-center-heading">消息中心</h1>
          <p>查看与你的讨论、标的观察相关的消息。</p>
        </div>
        <div className={styles.unreadSummary}>
          <span>当前未读</span>
          <strong data-testid="notification-total-unread">
            {counts.total}
          </strong>
          <small>仅在本次会话保留</small>
        </div>
      </header>

      {/*
        这段说明必须跟着实现走。
        原文是「发送者、动作与时间均为固定离线 fixture……不代表真实用户消息」
        ——而登录之后，关注、提及这些真实事件就是从库里读出来、并入同一个
        列表渲染的。那句话会把一条真人的关注明确说成假的，方向刚好反了。
      */}
      {account === null ? (
        <aside className={styles.disclosure} aria-label="消息数据说明">
          <span aria-hidden="true">说</span>
          <div>
            <strong>
              {accountLoading ? "正在读取账号状态" : "登录后显示你的真实消息"}
            </strong>
            <p>
              {accountLoading
                ? "正在确认当前账号，请稍候。"
                : "关注、提及等事件来自本站账号的真实记录；已读与隐藏只在本次会话保留，刷新后重置。"}
            </p>
          </div>
        </aside>
      ) : null}

      <div className={styles.toolbar}>
        <div>
          <p className={styles.sectionLabel}>分类消息</p>
          <strong>{notifications.length} 条可见消息</strong>
        </div>
        <button
          className={styles.readAllButton}
          disabled={counts.total === 0}
          onClick={readEverything}
          type="button"
        >
          全部已读
        </button>
      </div>

      <nav aria-label="消息分类筛选" className={styles.filters}>
        <button
          aria-pressed={activeFilter === "all"}
          onClick={() => chooseFilter("all")}
          type="button"
        >
          <span>全部消息</span>
          <strong>{counts.total}</strong>
          <small>未读</small>
        </button>
        {notificationCategories.map((category) => (
          <button
            aria-label={`${category.label}，${counts.byCategory[category.id]} 条未读`}
            aria-pressed={activeFilter === category.id}
            key={category.id}
            onClick={() => chooseFilter(category.id)}
            type="button"
          >
            <span>{category.label}</span>
            <strong>{counts.byCategory[category.id]}</strong>
            <small>未读</small>
          </button>
        ))}
      </nav>

      <p aria-live="polite" className="visually-hidden">
        {announcement}
      </p>

      {visibleNotifications.length > 0 ? (
        <ol className={styles.list}>
          {visibleNotifications.map((notification) => (
            <li key={notification.id}>
              <NotificationCard
                notification={notification}
                onHide={hideNotification}
                onOpen={openNotification}
                onToggleRead={toggleRead}
              />
            </li>
          ))}
        </ol>
      ) : (
        <section
          className={styles.empty}
          aria-labelledby="notification-empty-heading"
        >
          <span aria-hidden="true">✓</span>
          <h3 id="notification-empty-heading">这个分类暂时没有消息</h3>
          <p>已隐藏的消息只在本次会话中移除，刷新页面会恢复初始记录。</p>
          {activeFilter !== "all" ? (
            <button onClick={() => chooseFilter("all")} type="button">
              查看全部消息
            </button>
          ) : null}
        </section>
      )}

      <footer className={styles.footer}>
        <span>消息按时间排序</span>
        <span>已读与隐藏状态仅在本次会话保留</span>
      </footer>
    </section>
  );
}
