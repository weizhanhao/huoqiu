import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CommunityPage from "../../src/app/community/page";
import PostDetailPage from "../../src/app/community/posts/post_syn_0001/page";
import PublishPage from "../../src/app/publish/page";
import { HomeCommunityStream } from "../../src/features/community/community-experience";
import {
  communityAuthors,
  communityFeedCards,
  getCommunityAuthor,
  getCommunityFeedCards,
  syntheticCommunitySource,
} from "../../src/features/community/community-fixtures";

describe("community routes", () => {
  it("renders all six synthetic feed channels and a recognizable card type", () => {
    const markup = renderToStaticMarkup(<CommunityPage />);

    for (const channel of ["关注", "热门", "资讯", "达人", "基金", "ETF"]) {
      expect(markup).toContain(channel);
    }
    expect(markup).toContain("帖子");
    expect(markup).toContain("合成演示内容");
    expect(markup).toContain("发布合成草稿");
  });

  it("renders a scrollable social feed with author context, media, and engagement", () => {
    const communityMarkup = renderToStaticMarkup(<CommunityPage />);
    const homeMarkup = renderToStaticMarkup(<HomeCommunityStream />);

    expect(
      communityMarkup.match(/data-testid="community-feed-card"/gu),
    ).toHaveLength(5);
    expect(communityMarkup).toContain("合成达人观察席");
    expect(communityMarkup).toContain("合成观察作者");
    expect(communityMarkup).toContain("4,820 次合成浏览");
    expect(communityMarkup).toContain("本地媒体占位");
    expect(communityMarkup).toContain("SYNTHETIC / 固定演示内容");

    expect(
      homeMarkup.match(/data-testid="community-feed-card"/gu),
    ).toHaveLength(8);
    expect(homeMarkup).toContain("社区热帖与长文");
    expect(homeMarkup).toContain("浏览完整合成社区");
  });

  it("provides synthetic cards for every required recognizable type", () => {
    expect(communityFeedCards.map((card) => card.kind)).toEqual(
      expect.arrayContaining(["帖子", "资讯", "话题", "视频占位"]),
    );
  });

  it("publishes a dense, deterministic synthetic registry through one query seam", () => {
    expect(communityFeedCards.length).toBeGreaterThanOrEqual(24);
    expect(new Set(communityFeedCards.map(({ id }) => id)).size).toBe(
      communityFeedCards.length,
    );
    expect(communityFeedCards.some(({ id }) => id === "post_syn_0001")).toBe(
      true,
    );

    for (const channel of [
      "关注",
      "热门",
      "资讯",
      "达人",
      "基金",
      "ETF",
    ] as const) {
      expect(getCommunityFeedCards(channel).length).toBeGreaterThanOrEqual(4);
    }

    expect(
      communityFeedCards.every(
        ({ authorId, engagement, source, synthetic, tags }) =>
          synthetic &&
          source === syntheticCommunitySource &&
          getCommunityAuthor(authorId) !== undefined &&
          tags.length > 0 &&
          Object.values(engagement).every((count) => count >= 0),
      ),
    ).toBe(true);
    expect(communityAuthors.length).toBeGreaterThanOrEqual(8);
  });

  it("renders the post author, risk disclosure, reactions, and nested comments", () => {
    const markup = renderToStaticMarkup(<PostDetailPage />);

    expect(markup).toContain("合成作者 · 北岸观察员");
    expect(markup).toContain("风险提示");
    expect(markup).toContain("相关标的");
    expect(markup).toContain("关注作者");
    expect(markup).toContain("点赞 128");
    expect(markup).toContain("回复");
    expect(markup).toContain("1,860 位合成关注者");
    expect(markup).toContain("18 次合成转发");
    expect(
      markup.match(/data-testid="synthetic-comment"/gu)?.length,
    ).toBeGreaterThanOrEqual(6);
    expect(
      markup.match(/data-testid="synthetic-reply"/gu)?.length,
    ).toBeGreaterThanOrEqual(5);
  });

  it("renders discussion and long-article publisher controls", () => {
    const markup = renderToStaticMarkup(<PublishPage />);

    expect(markup).toContain("发讨论");
    expect(markup).toContain("写长文");
    expect(markup).toContain("选择本地图片");
    expect(markup).toContain("话题（暂未开放）");
    expect(markup).toContain("发布到本次会话");
  });
});
