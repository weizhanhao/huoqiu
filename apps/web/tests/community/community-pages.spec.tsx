import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CommunityPage from "../../src/app/community/page";
import PostDetailPage from "../../src/app/community/posts/post_syn_0001/page";
import PublishPage from "../../src/app/publish/page";
import { HomeCommunityStream } from "../../src/features/community/home-community-stream";
import {
  communityAuthors,
  communityFeedCards,
  getCommunityAuthor,
  getCommunityFeedCards,
  syntheticCommunitySource,
} from "../../src/features/community/community-fixtures";

describe("community routes", () => {
  it("keeps the home community stream in a server-safe, small fixture boundary", () => {
    const homePageSource = readFileSync(
      fileURLToPath(new URL("../../src/app/page.tsx", import.meta.url)),
      "utf8",
    );
    const homeStreamSource = readFileSync(
      fileURLToPath(
        new URL(
          "../../src/features/community/home-community-stream.tsx",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    const homeFixtureSource = readFileSync(
      fileURLToPath(
        new URL(
          "../../src/features/community/home-community-fixtures.ts",
          import.meta.url,
        ),
      ),
      "utf8",
    );

    expect(homePageSource).toContain(
      'from "../features/community/home-community-stream"',
    );
    expect(homePageSource).not.toContain("community-experience");
    expect(homeStreamSource).not.toContain('"use client"');
    expect(homeStreamSource).not.toContain('from "./community-experience"');
    expect(homeFixtureSource).not.toContain("community-fixtures");
    expect(homeFixtureSource).not.toContain("communityFeedCards");
  });

  it("renders all six synthetic feed channels and a recognizable card type", () => {
    const markup = renderToStaticMarkup(<CommunityPage />);

    for (const channel of ["关注", "热门", "资讯", "达人", "基金", "ETF"]) {
      expect(markup).toContain(channel);
    }
    expect(markup).toContain("帖子");
    /*
     * 内容来源必须在页面上讲清楚——这条要求不变，变的是措辞：
     * 从「合成演示内容」这种内部说法，改成告诉用户栏目与用户内容各自
     * 从哪来。同时保留「不构成投资建议」这句合规声明。
     */
    expect(markup).toContain("栏目记录由编辑部维护");
    expect(markup).toContain("不构成投资建议");
    expect(markup).toContain("写帖子");
  });

  it("renders a scrollable social feed with author context, media, and engagement", () => {
    const communityMarkup = renderToStaticMarkup(<CommunityPage />);
    const homeMarkup = renderToStaticMarkup(<HomeCommunityStream />);

    expect(
      communityMarkup.match(/data-testid="community-feed-card"/gu),
    ).toHaveLength(5);
    expect(communityMarkup).toContain("达人观察席");
    expect(communityMarkup).toContain("观察作者");
    expect(communityMarkup).toContain("4,820 次浏览");
    expect(communityMarkup).toContain("本地媒体占位");
    /*
     * 来源标注仍是硬要求，但标的内容变了：过去标「演示内容」，
     * 现在如实标「栏目」——读者需要分清编辑部维护的栏目记录与
     * 注册用户自己发布的帖子。断言意图不变：非用户内容必须带可见标识。
     */
    expect(communityMarkup).toContain("栏目");

    expect(
      homeMarkup.match(/data-testid="community-feed-card"/gu),
    ).toHaveLength(8);
    expect(homeMarkup).toContain("社区热帖与长文");
    expect(homeMarkup).toContain("浏览完整社区");
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
      expect(getCommunityFeedCards(channel)).toHaveLength(5);
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

    // 作者名从纯文本改成了通往主页的真实链接，所以断言随之升级：
    // 不只是「出现了作者名」，而是「作者名可以点进 TA 的主页」。
    expect(markup).toContain(
      '<a href="/users/author_syn_northbank">北岸观察员</a>',
    );
    expect(markup).toContain("风险提示");
    expect(markup).toContain("相关标的");
    expect(markup).toContain("关注作者");
    /*
     * 「点赞 128」曾是 community-state.ts 里的一个常量，30 篇帖子共用——
     * 一条刚发出来、真实赞数为 0 的帖子在详情页也显示 128，点一下变 129，
     * 刷新又回到 128。现在这里用的是信息流里那个真的 LikeButton。
     */
    expect(markup).toContain("128 赞");
    expect(markup).toContain("回复");
    expect(markup).toContain("1,860 位读者");
    /*
     * 过去这里断言的「18 次合成转发 · 96 次合成收藏 · 4,820 次合成浏览」
     * 是一行写死的文案，30 篇帖子共用同一组数字。现在改为断言这一篇
     * 自己的数据——断言因此变强了，而不是被削弱。
     */
    expect(markup).toContain("18 次转发");
    expect(markup).toContain("4,820 次浏览");
    expect(markup).toContain("展示 7 条评论 / 页面基线共 32 条");
    expect(markup).toContain("栏目 7 条 · 本次会话 0 条");
    expect(
      markup.match(/data-testid="fixed-synthetic-comment"/gu),
    ).toHaveLength(7);
    expect(markup.match(/data-testid="fixed-synthetic-reply"/gu)).toHaveLength(
      6,
    );
    expect(markup).not.toContain('data-testid="session-local-comment"');
    expect(markup).not.toContain('data-testid="session-local-reply"');
  });

  it("renders discussion and long-article publisher controls", () => {
    const markup = renderToStaticMarkup(<PublishPage />);

    expect(markup).toContain("发讨论");
    expect(markup).toContain("写长文");
    expect(markup).toContain("选择本地图片");
    // 话题 / @用户 / 关联标的已从「暂未开放」做成真实的正文插入器，
    // 断言改为检验三个入口都在且可选，而不是检验占位文案还在。
    expect(markup).toContain("插入话题");
    expect(markup).toContain("插入用户");
    /*
     * 「关联标的」此前是一个下拉框，列着 35 个虚构公司——选哪个都会给帖子
     * 打上一个不存在的标的标记，而那条帖子在任何真实标的页上都不会出现。
     * 现在是填真实代码的输入框。
     */
    expect(markup).toContain("关联标的");
    expect(markup).toContain("填代码后回车");
    expect(markup).not.toContain("插入标的");
    expect(markup).not.toContain("暂未开放");
    expect(markup).toContain("发布到本次会话");
  });
});
