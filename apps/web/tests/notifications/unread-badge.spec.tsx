import { describe, expect, it } from "vitest";

/*
 * 顶栏那个未读数。
 *
 * 它此前恒定显示「5」——因为通知状态的默认种子是六条虚构通知，其中五条
 * 标着未读：「北岸观察员 回复了你的讨论」「长线手记 赞了你的讨论」……
 * 这些事都没发生过。
 *
 * 这个数字比通知页本身更要命：通知页至少还挂着一条「以下为离线样本」的
 * 说明，而徽标出现在每一页的顶栏和左栏，没有任何说明，就是一个红点加一个
 * 数字。任何人打开站点，第一眼看到的都是「你有 5 条未读」。
 *
 * 真实通知是有的（关注、提及都落在库里，登录后会整体替换掉这批种子）。
 * 所以默认值应当是空，而不是一批编出来的未读。
 */

describe("the unread badge before any real data arrives", () => {
  it("counts nothing when nobody has done anything to you", async () => {
    const { initialNotificationUnreadCount } =
      await import("../../src/features/notifications/notification-state");

    expect(initialNotificationUnreadCount).toBe(0);
  });

  it("ships no invented notifications as the default state", async () => {
    const { createNotificationState, notificationUnreadCounts } =
      await import("../../src/features/notifications/notification-state");

    const state = createNotificationState();
    const counts = notificationUnreadCounts(state);

    /*
     * 分类计数也要全为零。只把总数改成 0、各分类仍留着样本，会得到
     * 一个「总共 0 条未读，回复里却有 2 条未读」的自相矛盾界面。
     */
    expect(counts.total).toBe(0);
    for (const [category, count] of Object.entries(counts.byCategory)) {
      expect(count, category).toBe(0);
    }
  });
});
