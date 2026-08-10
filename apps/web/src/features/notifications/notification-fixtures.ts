export const notificationCategories = [
  { id: "replies", label: "回复我的", shortLabel: "回复" },
  { id: "mentions", label: "提到我的", shortLabel: "提及" },
  { id: "likes", label: "赞我的", shortLabel: "赞" },
  { id: "system", label: "系统消息", shortLabel: "系统" },
] as const;

export type NotificationCategoryId =
  (typeof notificationCategories)[number]["id"];

type NotificationLinkTarget = Readonly<{
  href: "/community/posts/post_syn_0001" | "/instruments/listing_syn_0001";
  kind: "link";
  label: string;
}>;

type NotificationUnavailableTarget = Readonly<{
  kind: "unavailable";
  label: "原对象已不可用";
  reason: string;
}>;

export type NotificationTarget =
  NotificationLinkTarget | NotificationUnavailableTarget;

export type SyntheticNotification = Readonly<{
  action: string;
  actor: Readonly<{
    initials: string;
    name: string;
  }>;
  category: NotificationCategoryId;
  createdAt: string;
  id: string;
  isRead: boolean;
  summary: string;
  target: NotificationTarget;
  timeLabel: string;
}>;

export const syntheticNotifications: readonly SyntheticNotification[] = [
  {
    action: "回复了你的讨论",
    actor: { initials: "北", name: "合成作者 · 北岸观察员" },
    category: "replies",
    createdAt: "2026-08-10T10:18:00+08:00",
    id: "notification_syn_reply_0001",
    isRead: false,
    summary: "估值假设变化时，先记录原因，再观察数据是否兑现。",
    target: {
      href: "/community/posts/post_syn_0001",
      kind: "link",
      label: "合成市场午后观察",
    },
    timeLabel: "08-10 10:18",
  },
  {
    action: "回复了你的评论",
    actor: { initials: "静", name: "合成用户 · 静观样本" },
    category: "replies",
    createdAt: "2026-08-09T18:42:00+08:00",
    id: "notification_syn_reply_0002",
    isRead: true,
    summary: "同意，把反证条件写清楚会让观察更有边界。",
    target: {
      href: "/community/posts/post_syn_0001",
      kind: "link",
      label: "一份关于长期观察节奏的合成笔记",
    },
    timeLabel: "08-09 18:42",
  },
  {
    action: "在讨论中提到了你",
    actor: { initials: "研", name: "合成用户 · 研报练习生" },
    category: "mentions",
    createdAt: "2026-08-10T09:26:00+08:00",
    id: "notification_syn_mention_0001",
    isRead: false,
    summary: "这组公开数据的观察口径，或许可以和你的清单放在一起看。",
    target: {
      href: "/community/posts/post_syn_0001",
      kind: "link",
      label: "研究中的反证清单",
    },
    timeLabel: "08-10 09:26",
  },
  {
    action: "在标的讨论中提到了你",
    actor: { initials: "量", name: "合成用户 · 量能记录员" },
    category: "mentions",
    createdAt: "2026-08-08T15:08:00+08:00",
    id: "notification_syn_mention_0002",
    isRead: true,
    summary: "合成示例一号的固定快照已经补充，欢迎核对观察口径。",
    target: {
      href: "/instruments/listing_syn_0001",
      kind: "link",
      label: "合成示例一号",
    },
    timeLabel: "08-08 15:08",
  },
  {
    action: "赞了你的讨论",
    actor: { initials: "长", name: "合成用户 · 长线手记" },
    category: "likes",
    createdAt: "2026-08-10T08:54:00+08:00",
    id: "notification_syn_like_0001",
    isRead: false,
    summary: "你的合成讨论《波动中的长期视角》收到了一次演示点赞。",
    target: {
      href: "/community/posts/post_syn_0001",
      kind: "link",
      label: "波动中的长期视角",
    },
    timeLabel: "08-10 08:54",
  },
  {
    action: "更新了演示标的说明",
    actor: { initials: "火", name: "火球演示助手" },
    category: "system",
    createdAt: "2026-08-10T08:00:00+08:00",
    id: "notification_syn_system_0001",
    isRead: false,
    summary: "合成示例一号新增固定快照说明；数据仍为离线演示内容。",
    target: {
      href: "/instruments/listing_syn_0001",
      kind: "link",
      label: "查看演示标的",
    },
    timeLabel: "08-10 08:00",
  },
  {
    action: "发送了一条对象状态提醒",
    actor: { initials: "火", name: "火球演示助手" },
    category: "system",
    createdAt: "2026-08-09T12:30:00+08:00",
    id: "notification_syn_system_0002",
    isRead: false,
    summary: "这条合成消息引用的演示对象已经移除，内容不再提供访问入口。",
    target: {
      kind: "unavailable",
      label: "原对象已不可用",
      reason: "演示对象已移除，没有可访问的详情页。",
    },
    timeLabel: "08-09 12:30",
  },
];
