import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PostComment, SocialPost } from "../../../src/api/social-api";
import { PostDetailScreen } from "../../../src/components/post/post-detail-screen";

/*
 * 帖子详情。
 *
 * 这一页最容易出的错不是崩，是「少显示一条」：某条回复没画出来，页面看起来
 * 完全正常，只有发的那个人知道自己的话不见了。所以这里守的多是「某条内容
 * 在不在页面上」。
 */

const post: SocialPost = {
  authorId: "acct_1",
  authorName: "林岸",
  body: "季报读完了，先不动。",
  createdAt: "2026-08-17T02:23:00.000Z",
  id: "post_1",
  likeCount: 12,
  title: "季报读完了",
};

const comment = (
  id: string,
  authorName: string,
  createdAt: string,
  parentId?: string,
): PostComment => ({
  authorId: `acct_${id}`,
  authorName,
  body: `${authorName}说的话`,
  createdAt,
  id,
  ...(parentId === undefined ? {} : { parentId }),
  postId: "post_1",
});

const render = (
  overrides: Partial<Parameters<typeof PostDetailScreen>[0]> = {},
): string =>
  renderToStaticMarkup(
    <PostDetailScreen
      accounts={[{ displayName: "林岸", id: "acct_1" }]}
      bookmarked={false}
      comments={[]}
      commentsFailure={null}
      draft=""
      following={false}
      likeCount={12}
      liked={false}
      onAddToWatchlist={vi.fn()}
      onBack={vi.fn()}
      onChangeDraft={vi.fn()}
      onOpenAuthor={vi.fn()}
      onOpenInstrument={vi.fn()}
      onOpenTopic={vi.fn()}
      onOpenUser={vi.fn()}
      onReplyTo={vi.fn()}
      onSubmit={vi.fn()}
      onToggleBookmark={vi.fn()}
      onToggleFollow={vi.fn()}
      onToggleLike={vi.fn()}
      post={post}
      postFailure={null}
      postLoaded
      replyTo={null}
      sending={false}
      topics={[]}
      {...overrides}
    />,
  );

describe("post detail", () => {
  it("names this product in the risk notice", () => {
    /*
     * 参考图那句风险提示里写的是参考产品的名字。照抄进来，用户第一眼看到的
     * 就是别人家的招牌。
     */
    const markup = render();

    expect(markup).toContain("与火球的立场无关");
    expect(markup).not.toContain("雪球");
  });

  it("shows a reply written to another reply", () => {
    /*
     * 网页版那份只认「父就是顶层」的分组会让这条消失：丙回复乙，乙回复甲，
     * 丙既不在顶层也不在甲的回复里。
     */
    const markup = render({
      comments: [
        comment("c1", "甲", "2026-08-17T03:00:00.000Z"),
        comment("c2", "乙", "2026-08-17T04:00:00.000Z", "c1"),
        comment("c3", "丙", "2026-08-17T05:00:00.000Z", "c2"),
      ],
    });

    expect(markup).toContain("丙说的话");
    expect(markup).toContain("回复 @乙");
  });

  it("collapses replies past the second one behind a count", () => {
    const markup = render({
      comments: [
        comment("c1", "甲", "2026-08-17T03:00:00.000Z"),
        comment("c2", "乙", "2026-08-17T04:00:00.000Z", "c1"),
        comment("c3", "丙", "2026-08-17T05:00:00.000Z", "c1"),
        comment("c4", "丁", "2026-08-17T06:00:00.000Z", "c1"),
      ],
    });

    expect(markup).toContain("乙说的话");
    expect(markup).toContain("丙说的话");
    expect(markup).not.toContain("丁说的话");
    expect(markup).toContain("查看全部 3 条回复");
  });

  it("does not claim there are no comments while they are still loading", () => {
    /*
     * 「还没取到」和「取到了，是空的」是两回事。混成一句，网慢的时候每条帖子
     * 看起来都没人讨论，用户不会再等第二眼。
     */
    const loading = render({ comments: null });
    const empty = render({ comments: [] });

    expect(loading).not.toContain("还没有人讨论");
    expect(empty).toContain("还没有人讨论");
  });

  it("marks the like as already given instead of only showing a number", () => {
    /*
     * 只显示数字的话，赞过和没赞过长得一模一样——用户会再点一次确认，
     * 而那一下正好把赞取消掉。
     */
    expect(render({ liked: true })).toContain("已赞 12");
    expect(render({ liked: false })).not.toContain("已赞");
  });

  it("says who the reply is going to before it is sent", () => {
    const markup = render({
      comments: [comment("c1", "甲", "2026-08-17T03:00:00.000Z")],
      replyTo: comment("c1", "甲", "2026-08-17T03:00:00.000Z"),
    });

    expect(markup).toContain("回复 @甲");
    expect(markup).toContain("取消");
  });
  it("tells a deleted post apart from one still loading", () => {
    /*
     * 帖子被删掉、或转回草稿之后，取数是成功的，列表里就是没有这条。此前这
     * 两种情况共用一句「正在读取这条内容……」——从消息点进一条已删的帖子，
     * 看到的是一个永远转不完的加载态。
     */
    const loading = render({ post: null, postLoaded: false });
    const gone = render({ post: null, postLoaded: true });

    expect(loading).toContain("正在读取");
    expect(gone).toContain("不在了");
    expect(gone).not.toContain("正在读取");
  });
});
