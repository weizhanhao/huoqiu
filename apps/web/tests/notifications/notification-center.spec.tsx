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

  it("defines every notification category with stable synthetic targets", async () => {
    const { notificationCategories, syntheticNotifications } =
      await loadState();

    expect(notificationCategories.map(({ label }) => label)).toEqual([
      "回复我的",
      "提到我的",
      "赞我的",
      "新增粉丝",
      "系统消息",
    ]);

    /*
     * 原先断言的是「每个分类都至少有一条样本」。
     *
     * 「新增粉丝」打破了这个前提，而且是刻意的：它只来自 follows 表里的真实
     * 事件，样本里一条都不造。所以换成两条更该守的：样本分类不得越出已定义
     * 的分类；粉丝分类在样本中必须为空——一旦有人往里塞样本，就说明又开始
     * 拿假数据填真实分类了。
     */
    const sampleCategories = new Set(
      syntheticNotifications.map(({ category }) => category),
    );
    const declared = new Set(notificationCategories.map(({ id }) => id));
    for (const category of sampleCategories) {
      expect(declared).toContain(category);
    }
    expect(sampleCategories).not.toContain("follows");
    expect(
      syntheticNotifications.flatMap(({ target }) =>
        target.kind === "link" ? [target.href] : [],
      ),
    ).toEqual(
      expect.arrayContaining([
        "/community/posts/post_syn_0001",
        /*
         * 标的通知此前链的是 /instruments/listing_syn_0001——一个已经删掉的
         * 虚构公司，点开就是「没有找到这个页面」。通知里的每一条链接都该
         * 能真的打开。
         */
        "/instruments/sh600519",
      ]),
    );
    expect(
      syntheticNotifications.flatMap(({ target }) =>
        target.kind === "link" ? [target.href] : [],
      ),
    ).not.toContain("/instruments/listing_syn_0001");
    expect(
      syntheticNotifications.some(
        ({ target }) => target.kind === "unavailable",
      ),
    ).toBe(true);
  });

  it("calculates total and category unread counts", async () => {
    const {
      createNotificationState,
      notificationUnreadCounts,
      syntheticNotifications,
    } = await loadState();
    const counts = notificationUnreadCounts(
      createNotificationState(syntheticNotifications),
    );

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
      syntheticNotifications,
    } = await loadState();
    const initial = createNotificationState(syntheticNotifications);
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
      syntheticNotifications,
    } = await loadState();

    const read = notificationReducer(
      createNotificationState(syntheticNotifications),
      {
        type: "mark-all-read",
      },
    );

    expect(notificationUnreadCounts(read).total).toBe(0);
    expect(read.notifications.every(({ isRead }) => isRead)).toBe(true);
  });

  it("hides notifications and exposes a stable category empty state", async () => {
    const {
      createNotificationState,
      notificationReducer,
      syntheticNotifications,
    } = await loadState();
    const initial = createNotificationState(syntheticNotifications);
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
    const { NotificationSessionProvider, syntheticNotifications } =
      await loadState();
    /*
     * 样本要显式传进来。默认状态已经改成空的——否则站上每个人的顶栏都会
     * 顶着一个编出来的未读数。这一条测的是「有通知时怎么渲染」，样本由
     * 用例自己提供。
     */
    const markup = renderToStaticMarkup(
      <NotificationSessionProvider
        initialNotifications={syntheticNotifications}
      >
        <NotificationCenter />
      </NotificationSessionProvider>,
    );

    expect(markup).toContain("消息中心");
    /*
     * 说明栏原文是「样本数据 · 非实时……不代表真实用户消息」。登录之后，
     * 关注、提及这些真实事件就是从库里读出来并入同一个列表的——那句话会把
     * 一条真人的关注明确说成假的。断言跟着改过的文案走。
     */
    expect(markup).toContain("登录后显示你的真实消息");
    expect(markup).not.toContain("固定离线 fixture");
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
