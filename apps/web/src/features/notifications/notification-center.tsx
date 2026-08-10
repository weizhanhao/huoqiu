"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import styles from "./notification-center.module.css";
import {
  notificationCategories,
  notificationCategoryLabel,
  useNotificationSession,
  type NotificationCategoryId,
  type SyntheticNotification,
} from "./notification-state";

type NotificationFilter = "all" | NotificationCategoryId;

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

export function NotificationCenter() {
  const { counts, hide, markAllRead, markRead, markUnread, notifications } =
    useNotificationSession();
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
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
    setAnnouncement("通知已读，正在打开关联的合成内容。");
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
          <p className={styles.kicker}>SESSION INBOX · FIXED FIXTURE</p>
          <h2 id="notification-center-heading">消息中心</h2>
          <p>查看与你的合成讨论、标的观察和演示账户相关的消息。</p>
        </div>
        <div className={styles.unreadSummary}>
          <span>当前未读</span>
          <strong data-testid="notification-total-unread">
            {counts.total}
          </strong>
          <small>仅在本次会话保留</small>
        </div>
      </header>

      <aside className={styles.disclosure} aria-label="消息数据说明">
        <span aria-hidden="true">演</span>
        <div>
          <strong>演示数据 / 合成数据 · 不构成投资建议</strong>
          <p>
            发送者、动作与时间均为固定离线 fixture；刷新后交互状态会重置，
            不代表真实用户消息或跨端同步。
          </p>
        </div>
      </aside>

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
          <p>已隐藏的消息只在本次会话中移除，刷新页面会恢复固定演示数据。</p>
          {activeFilter !== "all" ? (
            <button onClick={() => chooseFilter("all")} type="button">
              查看全部消息
            </button>
          ) : null}
        </section>
      )}

      <footer className={styles.footer}>
        <span>合成消息 · 未经运营审核</span>
        <span>SESSION ONLY / NO LIVE SERVICE</span>
      </footer>
    </section>
  );
}
