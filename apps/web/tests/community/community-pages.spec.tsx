import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CommunityPage from "../../src/app/community/page";
import PostDetailPage from "../../src/app/community/posts/post_syn_0001/page";
import PublishPage from "../../src/app/publish/page";
import { communityFeedCards } from "../../src/features/community/community-fixtures";

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

  it("provides synthetic cards for every required recognizable type", () => {
    expect(communityFeedCards.map((card) => card.kind)).toEqual(
      expect.arrayContaining(["帖子", "资讯", "话题", "视频占位"]),
    );
  });

  it("renders the post author, risk disclosure, reactions, and nested comments", () => {
    const markup = renderToStaticMarkup(<PostDetailPage />);

    expect(markup).toContain("合成作者 · 北岸观察员");
    expect(markup).toContain("风险提示");
    expect(markup).toContain("相关标的");
    expect(markup).toContain("关注作者");
    expect(markup).toContain("点赞 128");
    expect(markup).toContain("回复");
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
