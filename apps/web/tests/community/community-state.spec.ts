import { describe, expect, it } from "vitest";

import {
  addComment,
  addReply,
  createInitialCommunityState,
  publishDraft,
  selectChannel,
  toggleFollow,
  toggleReaction,
} from "../../src/features/community/community-state";

describe("community session interactions", () => {
  it("marks every prefilled discussion item as fixed synthetic content", () => {
    const state = createInitialCommunityState();

    expect(state.comments).toHaveLength(7);
    expect(
      state.comments.every(({ origin }) => origin === "fixed-synthetic"),
    ).toBe(true);
    expect(
      state.comments
        .flatMap(({ replies }) => replies)
        .every(({ origin }) => origin === "fixed-synthetic"),
    ).toBe(true);
  });

  it("changes the active feed channel to the user-visible channel label", () => {
    const state = selectChannel(createInitialCommunityState(), "热门");

    expect(state.activeChannel).toBe("热门");
    expect(state.feedAnnouncement).toBe("正在浏览热门频道");
  });

  it("follows and unfollows the post author", () => {
    const initial = createInitialCommunityState();
    const followed = toggleFollow(initial);

    expect(followed.isFollowing).toBe(true);
    expect(followed.followLabel).toBe("已关注");
    expect(toggleFollow(followed).followLabel).toBe("关注作者");
  });

  it("toggles a like while synchronising the visible count", () => {
    const liked = toggleReaction(createInitialCommunityState(), "like");

    expect(liked.isLiked).toBe(true);
    expect(liked.likes).toBe(129);
    expect(liked.likeLabel).toBe("已赞 129");
    expect(toggleReaction(liked, "like").likeLabel).toBe("点赞 128");
  });

  it("toggles a bookmark with a visible saved state", () => {
    const saved = toggleReaction(createInitialCommunityState(), "bookmark");

    expect(saved.isBookmarked).toBe(true);
    expect(saved.bookmarkLabel).toBe("已收藏");
    expect(toggleReaction(saved, "bookmark").bookmarkLabel).toBe("收藏");
  });

  it("adds a comment and rejects an empty comment with an accessible message", () => {
    const initial = createInitialCommunityState();
    const invalid = addComment(initial, "  ");
    const valid = addComment(initial, "我会继续观察量能变化。");

    expect(invalid.error).toBe("请输入评论内容后再发布。");
    expect(valid.comments.at(-1)?.body).toBe("我会继续观察量能变化。");
    expect(valid.comments.at(-1)?.origin).toBe("session-local");
    expect(valid.status).toBe("评论已添加到本次会话。");
  });

  it("adds a nested reply and rejects a blank reply", () => {
    const initial = createInitialCommunityState();
    const invalid = addReply(initial, "comment_syn_0001", "");
    const valid = addReply(initial, "comment_syn_0001", "同意，先看数据验证。");

    expect(invalid.error).toBe("请输入回复内容后再发布。");
    expect(valid.comments[0]?.replies.at(-1)?.body).toBe(
      "同意，先看数据验证。",
    );
    expect(valid.comments[0]?.replies.at(-1)?.origin).toBe("session-local");
    expect(valid.status).toBe("回复已添加到本次会话。");
  });
});

describe("publisher session interactions", () => {
  it("validates a discussion body before publishing", () => {
    const empty = publishDraft({ mode: "discussion", body: "  ", title: "" });
    const published = publishDraft({
      mode: "discussion",
      body: "这是一次合成讨论草稿。",
      title: "",
    });

    expect(empty.error).toBe("请输入讨论正文后再发布。");
    expect(published.success).toBe("合成草稿已发布到本次会话。");
  });

  it("requires a title and body for a long article", () => {
    const missingTitle = publishDraft({
      mode: "article",
      title: "",
      body: "长文正文",
    });
    const published = publishDraft({
      mode: "article",
      title: "我的合成观察笔记",
      body: "这里是本次会话中的合成长文正文。",
    });

    expect(missingTitle.error).toBe("请输入长文标题后再发布。");
    expect(published.success).toBe("合成草稿已发布到本次会话。");
  });
});
