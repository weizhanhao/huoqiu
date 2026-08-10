import { existsSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const loadState = async () =>
  import("../../src/features/notifications/notification-state");

const loadExperience = async () =>
  import("../../src/features/notifications/notification-center");

describe("notification center route and fixed synthetic data", () => {
  it("adds the notification route that the reviewed shell does not yet have", () => {
    expect(
      existsSync(
        new URL("../../src/app/notifications/page.tsx", import.meta.url),
      ),
    ).toBe(true);
  });

  it("defines all four notification categories with stable synthetic targets", async () => {
    const { notificationCategories, syntheticNotifications } =
      await loadState();

    expect(notificationCategories.map(({ label }) => label)).toEqual([
      "回复我的",
      "提到我的",
      "赞我的",
      "系统消息",
    ]);
    expect(
      new Set(syntheticNotifications.map(({ category }) => category)),
    ).toEqual(new Set(notificationCategories.map(({ id }) => id)));
    expect(
      syntheticNotifications.flatMap(({ target }) =>
        target.kind === "link" ? [target.href] : [],
      ),
    ).toEqual(
      expect.arrayContaining([
        "/community/posts/post_syn_0001",
        "/instruments/listing_syn_0001",
      ]),
    );
    expect(
      syntheticNotifications.some(
        ({ target }) => target.kind === "unavailable",
      ),
    ).toBe(true);
  });

  it("calculates total and category unread counts", async () => {
    const { createNotificationState, notificationUnreadCounts } =
      await loadState();
    const counts = notificationUnreadCounts(createNotificationState());

    expect(counts.total).toBeGreaterThan(0);
    expect(counts.byCategory.replies).toBeGreaterThan(0);
    expect(counts.byCategory.mentions).toBeGreaterThan(0);
    expect(counts.byCategory.likes).toBeGreaterThan(0);
    expect(counts.byCategory.system).toBeGreaterThan(0);
  });

  it("keeps fixture time labels stable across calendar days", async () => {
    const { syntheticNotifications } = await loadState();

    expect(
      syntheticNotifications.every(({ timeLabel }) =>
        /^08-\d{2} \d{2}:\d{2}$/u.test(timeLabel),
      ),
    ).toBe(true);
  });

  it("marks one notification read and unread without changing its order", async () => {
    const {
      createNotificationState,
      notificationReducer,
      notificationUnreadCounts,
    } = await loadState();
    const initial = createNotificationState();
    const firstUnread = initial.notifications.find(({ isRead }) => !isRead);
    expect(firstUnread).toBeDefined();
    if (firstUnread === undefined) return;

    const read = notificationReducer(initial, {
      id: firstUnread.id,
      type: "mark-read",
    });
    expect(notificationUnreadCounts(read).total).toBe(
      notificationUnreadCounts(initial).total - 1,
    );
    expect(read.notifications.map(({ id }) => id)).toEqual(
      initial.notifications.map(({ id }) => id),
    );

    const unread = notificationReducer(read, {
      id: firstUnread.id,
      type: "mark-unread",
    });
    expect(unread).toEqual(initial);
  });

  it("marks every visible notification read in one action", async () => {
    const {
      createNotificationState,
      notificationReducer,
      notificationUnreadCounts,
    } = await loadState();

    const read = notificationReducer(createNotificationState(), {
      type: "mark-all-read",
    });

    expect(notificationUnreadCounts(read).total).toBe(0);
    expect(read.notifications.every(({ isRead }) => isRead)).toBe(true);
  });

  it("hides notifications and exposes a stable category empty state", async () => {
    const { createNotificationState, notificationReducer } = await loadState();
    const initial = createNotificationState();
    const replies = initial.notifications.filter(
      ({ category }) => category === "replies",
    );
    const hidden = replies.reduce(
      (state, { id }) => notificationReducer(state, { id, type: "hide" }),
      initial,
    );

    expect(
      hidden.notifications.filter(({ category }) => category === "replies"),
    ).toEqual([]);
    expect(hidden.hiddenIds).toEqual(
      expect.arrayContaining(replies.map(({ id }) => id)),
    );
  });

  it("renders disclosure, filters, unread semantics, actions, and tombstone without a dead link", async () => {
    const { NotificationCenter } = await loadExperience();
    const { NotificationSessionProvider } = await loadState();
    const markup = renderToStaticMarkup(
      <NotificationSessionProvider>
        <NotificationCenter />
      </NotificationSessionProvider>,
    );

    expect(markup).toContain("消息中心");
    expect(markup).toContain("演示数据 / 合成数据 · 不构成投资建议");
    expect(markup).toContain("仅在本次会话保留");
    expect(markup).toContain("全部已读");
    expect(markup).toContain("未读通知");
    expect(markup).toContain("标为已读");
    expect(markup).toContain("隐藏");
    expect(markup).toContain("原对象已不可用");
    const tombstoneCard =
      /<article[^>]*data-notification-target="unavailable"[^>]*>[\s\S]*?<\/article>/u.exec(
        markup,
      )?.[0];
    expect(tombstoneCard).toBeDefined();
    expect(tombstoneCard).not.toContain("<a ");
    for (const label of ["回复我的", "提到我的", "赞我的", "系统消息"]) {
      expect(markup).toContain(label);
    }
  });
});
