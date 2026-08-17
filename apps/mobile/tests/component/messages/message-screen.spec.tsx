import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Notification } from "../../../src/api/social-api";
import { MessageScreen } from "../../../src/components/messages/message-screen";

/*
 * 消息。
 *
 * 这一页最容易糊弄过去的地方是「每条都说同一句话」——服务端明明分了
 * 回复/赞/关注/提到四种，界面上却一律写成同一个动作，看的人会以为自己被
 * 转发了十几次。
 */

const notification = (
  id: string,
  kind: Notification["kind"],
  category: Notification["category"],
): Notification => ({
  actorName: `发出者${id}`,
  category,
  createdAt: "2026-08-17T09:30:00.000Z",
  href: `/community/posts/post_${id}`,
  id,
  isRead: true,
  kind,
  summary: `${id} 的内容`,
  targetLabel: "我的帖子",
});

const render = (
  overrides: Partial<Parameters<typeof MessageScreen>[0]> = {},
): string =>
  renderToStaticMarkup(
    <MessageScreen
      category="replies"
      conversations={[]}
      failure={null}
      notifications={[]}
      onBack={vi.fn()}
      onOpen={vi.fn()}
      onOpenChat={vi.fn()}
      onSelectCategory={vi.fn()}
      signedIn
      {...overrides}
    />,
  );

describe("message screen", () => {
  it("offers every category the server actually produces", () => {
    const markup = render();

    expect(markup).toContain("回复我的");
    expect(markup).toContain("提到我的");
    expect(markup).toContain("赞我的");
    expect(markup).toContain("关注我的");
  });

  it("says what each kind of event actually was", () => {
    /*
     * 网页版那边就栽过一次：只认 follow 和 quote，其余一律写「转发了你的
     * 帖子」，于是有人评论、有人点赞，通知上都说是转发。
     */
    const likes = render({
      category: "likes",
      notifications: [notification("a", "like", "likes")],
    });
    const replies = render({
      category: "replies",
      notifications: [notification("b", "comment", "replies")],
    });

    expect(likes).toContain("赞了你的帖子");
    expect(likes).not.toContain("转发");
    expect(replies).toContain("回复了你的帖子");
  });

  it("only shows the category you are looking at", () => {
    const markup = render({
      category: "likes",
      notifications: [
        notification("a", "like", "likes"),
        notification("b", "comment", "replies"),
      ],
    });

    expect(markup).toContain("a 的内容");
    expect(markup).not.toContain("b 的内容");
  });

  it("tells being logged out apart from having no messages", () => {
    /*
     * 两句话混成一句的话，没登录的人看到「还没有消息」，会以为自己真的没人
     * 理——而其实是根本没去查他的。
     */
    const guest = render({ notifications: null, signedIn: false });
    const empty = render({ notifications: [], signedIn: true });
    const loading = render({ notifications: null, signedIn: true });

    expect(guest).toContain("登录后");
    expect(empty).toContain("这一类还没有消息");
    expect(loading).toContain("正在读取");
  });
});
