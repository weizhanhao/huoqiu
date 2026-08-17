import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SocialPost } from "../../../src/api/social-api";
import { FollowFeed } from "../../../src/components/follow/follow-feed";

/*
 * 手机上的关注流。
 *
 * 和网页版守同一批规则——两端各写一套筛选逻辑的话，迟早有一端先改，然后
 * 同一个账号在手机和网页上看到不同的内容，而两边都不报错。
 */

const post = (
  id: string,
  authorId: string,
  createdAt: string,
  body: string,
  title?: string,
): SocialPost => ({
  authorId,
  authorName: `作者${authorId}`,
  body,
  createdAt,
  id,
  likeCount: 0,
  /* 短帖的标题就是正文前 24 个字，与网页版 post-composer 一致。 */
  title: title ?? body.slice(0, 24),
});

const render = (
  overrides: Partial<Parameters<typeof FollowFeed>[0]> = {},
): string =>
  renderToStaticMarkup(
    <FollowFeed
      failure={null}
      following={[]}
      loading={false}
      onRefresh={vi.fn()}
      posts={[]}
      signedIn
      {...overrides}
    />,
  );

describe("mobile follow feed", () => {
  it("lists only posts written by people the viewer follows", () => {
    const markup = render({
      following: ["alice"],
      posts: [
        post("p1", "alice", "2026-02-01T09:00:00.000Z", "被关注的人写的"),
        post("p2", "bob", "2026-02-02T09:00:00.000Z", "没关注的人写的"),
      ],
    });

    expect(markup).toContain("被关注的人写的");
    /* 出现了没关注的人，这个页签就和「热门」没区别。 */
    expect(markup).not.toContain("没关注的人写的");
  });

  it("orders the newest post first", () => {
    const markup = render({
      following: ["alice"],
      posts: [
        post("p1", "alice", "2026-02-01T09:00:00.000Z", "旧的一条"),
        post("p2", "alice", "2026-03-01T09:00:00.000Z", "新的一条"),
      ],
    });

    expect(markup.indexOf("新的一条")).toBeLessThan(markup.indexOf("旧的一条"));
  });

  it("does not print a short post's body twice", () => {
    /*
     * 正文要长过 24 字，否则这条用例是空的：短帖的标题正是正文前 24 字，
     * 正文本身短于 24 字时标题和正文一模一样，数完整正文的出现次数
     * 抓不到「标题也印了一遍」——第一版就是这么写的，把标题恒显的变异
     * 放了过去。数那 24 字前缀才有区分度。
     */
    const body =
      "今天没动仓位，等季报出来再说，现在这个价位不值得追，追进去赚的是别人止盈的钱。";
    const derivedTitle = body.slice(0, 24);
    expect(body.length).toBeGreaterThan(24);

    const markup = render({
      following: ["alice"],
      posts: [post("p1", "alice", "2026-02-01T09:00:00.000Z", body)],
    });

    expect(markup.split(derivedTitle).length - 1).toBe(1);
  });

  it("keeps a long-form title the author actually wrote", () => {
    const markup = render({
      following: ["alice"],
      posts: [
        post(
          "p1",
          "alice",
          "2026-02-01T09:00:00.000Z",
          "正文从这里开始，和标题完全不同。",
          "一份关于估值的长文",
        ),
      ],
    });

    expect(markup).toContain("一份关于估值的长文");
  });

  it("says the network is down instead of saying there is nothing here", () => {
    /*
     * 手机不在服务所在的网段时会一直走这一支。说成「暂无内容」，用户会去找
     * 内容；说清是连不上，才会去看网络。
     */
    const markup = render({
      failure: "连不上服务器。确认手机和服务在同一个网络里。",
      following: ["alice"],
      posts: [],
    });

    expect(markup).toContain("连不上服务器");
    expect(markup).not.toContain("还没有关注任何人");
  });

  it("tells a signed-out visitor what this tab is for", () => {
    const markup = render({ signedIn: false });

    expect(markup).toContain("登录后这里会显示你关注的人发的内容");
  });

  it("distinguishes following nobody from followed people posting nothing", () => {
    /*
     * 合成一句「暂无内容」的话，刚关注完一个人的用户会以为关注没生效，
     * 回头再点一遍。
     */
    expect(render({ following: [], posts: [] })).toContain("还没有关注任何人");
    expect(render({ following: ["alice"], posts: [] })).toContain(
      "你关注的人还没有发过内容",
    );
  });
});
